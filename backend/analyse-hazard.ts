import { withDurableExecution, DurableContext, RetryDecision } from '@aws/durable-execution-sdk-js';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { RekognitionClient, DetectLabelsCommand } from '@aws-sdk/client-rekognition';
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import type { DynamoDBStreamEvent } from 'aws-lambda';

const ddb = new DynamoDBClient({});
const rekognition = new RekognitionClient({});
const bedrockAgent = new BedrockAgentRuntimeClient();
const TABLE_NAME = process.env.TABLE_NAME!;
const BUCKET_NAME = process.env.BUCKET_NAME!;
const AGENT_ID = process.env.BEDROCK_AGENT_ID!;
const AGENT_ALIAS_ID = process.env.BEDROCK_AGENT_ALIAS_ID!;

// Labels from Rekognition that map to runway hazard types
const HAZARD_LABELS: Record<string, string> = {
  'Bird': 'bird',
  'Pigeon': 'bird',
  'Seagull': 'bird',
  'Goose': 'bird',
  'Eagle': 'bird',
  'Crow': 'bird',
  'Hawk': 'bird',
  'Drone': 'drone',
  'UAV': 'drone',
  'Vehicle': 'vehicle',
  'Car': 'vehicle',
  'Truck': 'vehicle',
  'Van': 'vehicle',
  'Automobile': 'vehicle',
  'Debris': 'debris',
  'Litter': 'debris',
  'Trash': 'debris',
  'Person': 'vehicle',
};

/**
 * Retry strategy: allow one retry (2 total attempts) with a 2-second delay.
 */
const retryOnce = (_error: Error, attemptCount: number): RetryDecision => ({
  shouldRetry: attemptCount < 2,
  delay: { seconds: 5 },
});

/**
 * Invoke the Bedrock Agent. The agent will use its action group
 * to fetch the camera image from S3 for visual inspection.
 */
async function invokeHazardAgent(prompt: string, sessionId: string): Promise<string> {
  const response = await bedrockAgent.send(new InvokeAgentCommand({
    agentId: AGENT_ID,
    agentAliasId: AGENT_ALIAS_ID,
    sessionId,
    inputText: prompt,
    enableTrace: true,
  }));

  let result = '';
  if (response.completion) {
    for await (const chunk of response.completion) {
      if (chunk.chunk?.bytes) {
        result += new TextDecoder().decode(chunk.chunk.bytes);
      }
    }
  }
  return result;
}

/**
 * Durable function: multi-step hazard analysis workflow.
 *
 * Triggered by DynamoDB Streams when a record with PK='LATEST' is
 * inserted or modified (i.e. a new camera image is processed).
 *
 * Steps:
 *  1. Classify the hazard type using Amazon Rekognition
 *  2. Invoke Bedrock Agent to assess severity and describe the hazard
 *  3. Write an alert record to DynamoDB
 *
 * Each step is checkpointed — if the Lambda is interrupted,
 * it resumes from the last completed step on replay.
 */
export const handler = withDurableExecution(async (event: DynamoDBStreamEvent, context: DurableContext) => {
  for (const record of event.Records) {
    const newImage = record.dynamodb?.NewImage;
    if (!newImage) continue;

    const cameraId = newImage.SK?.S?.replace('CAMERA', 'camera-') ?? 'unknown';
    const imageKey = newImage.Key?.S ?? '';
    const detectedAt = newImage.Timestamp?.S ?? new Date().toISOString();
    const sessionId = `${cameraId}-${Date.now()}`;

    context.logger.info('Starting hazard analysis', { cameraId, imageKey });

    // Step 1 — detect hazards in the image using Amazon Rekognition
    const rekognitionResult = await context.step(`classify-hazard-${cameraId}`, async () => {
      const response = await rekognition.send(new DetectLabelsCommand({
        Image: {
          S3Object: {
            Bucket: BUCKET_NAME,
            Name: imageKey,
          },
        },
        MaxLabels: 20,
        MinConfidence: 70,
      }));

      const labels = (response.Labels ?? []).map((l) => ({
        name: l.Name ?? '',
        confidence: l.Confidence ?? 0,
      }));

      // Find the first detected label that matches a known hazard
      let hazardType = 'none';
      for (const label of labels) {
        if (label.name in HAZARD_LABELS) {
          hazardType = HAZARD_LABELS[label.name];
          break;
        }
      }

      return { hazardType, labels };
    }, { retryStrategy: retryOnce });

    let { hazardType, labels } = rekognitionResult;
    context.logger.info('Hazard classified', { cameraId, hazardType });

    // Step 2 — invoke Bedrock Agent with the image for visual assessment + severity
    const assessment = await context.step(`assess-severity-${cameraId}`, async () => {
      const prompt =
        `Analyse this runway hazard detected by ${cameraId}.\n` +
        `Rekognition hazard type: ${hazardType}\n` +
        `Rekognition labels: ${JSON.stringify(labels)}\n` +
        `Detected at: ${detectedAt}\n` +
        `Image location — bucket: "${BUCKET_NAME}", key: "${imageKey}". ` +
        `You should use fetchs3 tool to get image metadata and the presigned URL. Use the presigned URL to fetch the image\n` +
        `You should assess the image independently of the labels, and determine if it is a real hazard.\n` +
        `In particular, look out for birds, drones in the picture and look out for any debris or mechanical parts (e.g. wheels) on the runway\n` + 
        `If you cannot determine a severity, respond with severity "info" and a description of the image content.\n` +
        `For the purposes of image recognition, UAVs should be considered as drones\n` + 
        `If the rekognition hazard type is "vehicle", you should assess to see if there is actually an drone/UAV in the picture. If so, that should take precedence as the hazard\n` +
        `Respond with JSON only: {"severity":"critical|high|info|none","hazard":"bird|drone|vehicle|debris|unknown|none","description":"<one sentence description>"}`;

      context.logger.info('Invoking Bedrock Agent', {
        agentId: AGENT_ID,
        aliasId: AGENT_ALIAS_ID,
        sessionId,
        promptLength: prompt.length,
      });

      let raw: string;
      try {
        raw = await invokeHazardAgent(prompt, sessionId);
      } catch (err: unknown) {
        const error = err as Error & { $metadata?: unknown; Code?: string; name?: string };
        context.logger.error('Bedrock Agent invocation failed', {
          errorName: error.name,
          errorMessage: error.message,
          errorCode: error.Code,
          metadata: error.$metadata,
          stack: error.stack,
        });
        throw error;
      }

      context.logger.info('Bedrock Agent raw response', { raw: raw.substring(0, 500) });

      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            severity: parsed.severity as string,
            hazard: parsed.hazard as string,
            description: parsed.description as string,
          };
        }
      } catch {
        context.logger.warn('Failed to parse agent response, using fallback', { raw });
      }

      // Fallback if agent response can't be parsed
      const fallbackSeverity: Record<string, string> = {
        bird: 'high', debris: 'high', drone: 'critical', vehicle: 'critical',
      };
      return {
        severity: fallbackSeverity[hazardType] ?? 'none',
        description: `${hazardType} detected on ${cameraId}`,
      };
    }, { retryStrategy: retryOnce });

    context.logger.info('Severity assessed', { cameraId, severity: assessment.severity, hazard: assessment.hazard, description: assessment.description });

    if (hazardType === 'none' && assessment.hazard == 'none') {
      context.logger.info('No hazard detected, skipping alert', { cameraId });
      continue;
    }

    // Determine the correct hazard type
    if (assessment.hazard && assessment.hazard !== 'none') {
      hazardType = assessment.hazard;
    }

    // Step 3 — persist alert to DynamoDB
    await context.step(`write-alert-${cameraId}`, async () => {
      const now = new Date().toISOString();
      await ddb.send(new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: { S: 'ALERT' },
          SK: { S: sessionId },
          CameraId: { S: cameraId },
          HazardType: { S: hazardType },
          Severity: { S: assessment.severity },
          Description: { S: assessment.description },
          Key: { S: imageKey },
          DetectedAt: { S: detectedAt },
          ProcessedAt: { S: now },
          ProcessingTime: { N: (Date.now() - new Date(detectedAt).getTime()).toString() },
          ttl: { N: (Math.floor(Date.now() / 1000) + 60 * 180).toString() } // 3 hour TTL
        },
      }));
    }, { retryStrategy: retryOnce });

    context.logger.info('Alert created', { cameraId, hazardType, severity: assessment.severity });
  }

  return { status: 'completed', recordsProcessed: event.Records.length };
});
