import { withDurableExecution, DurableContext, RetryDecision } from '@aws/durable-execution-sdk-js';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { RekognitionClient, DetectLabelsCommand } from '@aws-sdk/client-rekognition';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { DynamoDBStreamEvent } from 'aws-lambda';

const ddb = new DynamoDBClient({});
const rekognition = new RekognitionClient({});
const s3 = new S3Client({});
const bedrockRuntime = new BedrockRuntimeClient({});
const TABLE_NAME = process.env.TABLE_NAME!;
const BUCKET_NAME = process.env.BUCKET_NAME!;
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'eu.amazon.nova-pro-v1:0';

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
  'Wheel': 'debris',
  'Litter': 'debris',
  'Trash': 'debris',
  'Person': 'vehicle',
};

/**
 * Retry strategy: allow one retry (2 total attempts) with a 5-second delay.
 */
const retryOnce = (_error: Error, attemptCount: number): RetryDecision => ({
  shouldRetry: attemptCount < 2,
  delay: { seconds: 5 },
});


/**
 * Durable function: multi-step hazard analysis workflow.
 *
 * Triggered by DynamoDB Streams when a record with PK='LATEST' is
 * inserted or modified (i.e. a new camera image is processed).
 *
 * Steps:
 *  1. Classify the hazard type using Amazon Rekognition
 *  2. Call Nova Pro directly via Converse API with the actual image bytes
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

    // Step 2 — call Nova Pro directly via Converse API with the actual image bytes
    const assessment = await context.step(`assess-severity-${cameraId}`, async () => {
      // Fetch the image from S3 so we can pass it directly to the model
      const s3Response = await s3.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: imageKey,
      }));
      const imageBytes = await s3Response.Body?.transformToByteArray();
      if (!imageBytes) {
        throw new Error(`Failed to read image from S3: ${imageKey}`);
      }

      const ext = imageKey.split('.').pop()?.toLowerCase() ?? 'jpeg';
      const mediaType = ext === 'png' ? 'png' : 'jpeg';

      const prompt =
        `Analyse this runway camera image from ${cameraId}.\n` +
        `Rekognition hazard type: ${hazardType}\n` +
        `Rekognition labels: ${JSON.stringify(labels)}\n` +
        `Detected at: ${detectedAt}\n` +
        `You should assess the image independently of the labels, and determine if it is a real hazard.\n` +
        `In particular, assess for any birds and drones/UAVs in the picture and look out for any debris or mechanical parts (e.g. wheels) on the runway.\n` +
        `Please check if an identified "airplane" is actually a UAV.\n` +
        `Wheels anywhere near the runway should be considered a high severity hazard.\n` +
        `If you cannot determine a severity, respond with severity "info" and a description of the image content.\n` +
        `For the purposes of image recognition, UAVs should be considered to be drones and should be a critical hazard.\n` +
        `If the rekognition hazard type is "vehicle", you should assess to see if there is actually a drone/UAV in the picture. If so, that should take precedence as the hazard.\n` +
        `Respond with JSON only: {"severity":"critical|high|info|none","hazard":"bird|drone|vehicle|debris|unknown|none","description":"<one sentence description>"}`;

      context.logger.info('Invoking Nova Pro via Converse API', {
        modelId: MODEL_ID,
        imageSizeBytes: imageBytes.length,
        mediaType,
      });

      let raw: string;
      try {
        const response = await bedrockRuntime.send(new ConverseCommand({
          modelId: MODEL_ID,
          messages: [
            {
              role: 'user',
              content: [
                {
                  image: {
                    format: mediaType,
                    source: { bytes: imageBytes },
                  },
                },
                { text: prompt },
              ],
            },
          ],
          system: [
            {
              text:
                'You are an airport runway safety expert. Analyse the provided camera image for hazards. ' +
                'Severity guidelines: ' +
                '"critical": drones, unauthorized vehicles, or persons on the runway — immediate danger to aircraft operations. ' +
                '"high": debris, foreign objects, birds, or large animals — significant risk requiring prompt action. ' +
                '"info": no clear hazard but noteworthy observation. ' +
                '"none": clear runway with no hazards. ' +
                'Respond ONLY with valid JSON.',
            },
          ],
          inferenceConfig: {
            maxTokens: 256,
            temperature: 0.1,
          },
        }));

        raw = response.output?.message?.content?.[0]?.text ?? '';
      } catch (err: unknown) {
        const error = err as Error & { $metadata?: unknown; Code?: string; name?: string };
        context.logger.error('Converse API invocation failed', {
          errorName: error.name,
          errorMessage: error.message,
          errorCode: error.Code,
          metadata: error.$metadata,
          stack: error.stack,
        });
        throw error;
      }

      context.logger.info('Nova Pro raw response', { raw: raw.substring(0, 500) });

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
        context.logger.warn('Failed to parse model response, using fallback', { raw });
      }

      // Fallback if model response can't be parsed
      const fallbackSeverity: Record<string, string> = {
        bird: 'high', debris: 'high', drone: 'critical', vehicle: 'critical',
      };
      return {
        severity: fallbackSeverity[hazardType] ?? 'none',
        hazard: hazardType,
        description: `${hazardType} detected on ${cameraId}`,
      };
    }, { retryStrategy: retryOnce });

    context.logger.info('Severity assessed', { cameraId, severity: assessment.severity, hazard: assessment.hazard, description: assessment.description });

    // If there is no assessment, don't send an alert
    if (hazardType === 'none' && assessment.hazard == 'none') {
      context.logger.info('No hazard detected, skipping alert', { cameraId });
      continue;
    }

    // If the Bedrock assessment of severity is "info" or "none", then don't send an alert
    if (assessment.severity === 'info' || assessment.severity === 'none') {
      context.logger.info('Assessment severity is info/none, skipping alert', { cameraId });
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
