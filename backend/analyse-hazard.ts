import { withDurableExecution, DurableContext } from '@aws/durable-execution-sdk-js';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { RekognitionClient, DetectLabelsCommand } from '@aws-sdk/client-rekognition';
import type { DynamoDBStreamEvent } from 'aws-lambda';

const ddb = new DynamoDBClient({});
const rekognition = new RekognitionClient({});
const TABLE_NAME = process.env.TABLE_NAME!;
const BUCKET_NAME = process.env.BUCKET_NAME!;

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
  'Vehicle': 'vehicle',
  'Car': 'vehicle',
  'Truck': 'vehicle',
  'Van': 'vehicle',
  'Automobile': 'vehicle',
  'Debris': 'debris',
  'Litter': 'debris',
  'Trash': 'debris',
  'Person': 'vehicle', // treat unauthorized person as vehicle-level hazard
};

/**
 * Durable function: multi-step hazard analysis workflow.
 *
 * Triggered by DynamoDB Streams when a record with PK='LATEST' is
 * inserted or modified (i.e. a new camera image is processed).
 *
 * Steps:
 *  1. Extract camera metadata from the stream record
 *  2. Classify the hazard type (bird, drone, debris, vehicle)
 *  3. Assess severity (critical / high / info)
 *  4. Write an alert record to DynamoDB
 *
 * Each step is checkpointed — if the Lambda is interrupted,
 * it resumes from the last completed step on replay.
 */
export const handler = withDurableExecution(async (event: DynamoDBStreamEvent, context: DurableContext) => {
  // Process each record from the DynamoDB stream batch
  for (const record of event.Records) {
    const newImage = record.dynamodb?.NewImage;
    if (!newImage) continue;

    const cameraId = newImage.SK?.S?.replace('CAMERA', 'camera-') ?? 'unknown';
    const imageKey = newImage.Key?.S ?? '';
    const detectedAt = newImage.Timestamp?.S ?? new Date().toISOString();

    context.logger.info('Starting hazard analysis', { cameraId, imageKey });

    // Step 1 — detect hazards in the image using Amazon Rekognition
    const hazardType = await context.step(`classify-hazard-${cameraId}`, async () => {
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

      // Find the first detected label that matches a known hazard
      for (const label of response.Labels ?? []) {
        const name = label.Name ?? '';
        if (name in HAZARD_LABELS) {
          return HAZARD_LABELS[name];
        }
      }

      // No hazard detected
      return 'none';
    });

    context.logger.info('Hazard classified', { cameraId, hazardType });

    // Step 2 — assess severity
    const severity = await context.step(`assess-severity-${cameraId}`, async () => {
      const severityMap: Record<string, string> = {
        bird: 'info',
        debris: 'high',
        drone: 'critical',
        vehicle: 'critical',
        none: 'none',
      };
      return severityMap[hazardType] ?? 'info';
    });

    context.logger.info('Severity assessed', { cameraId, severity });

    // Skip alert creation if no hazard was detected
    if (severity === 'none') {
      context.logger.info('No hazard detected, skipping alert', { cameraId });
      continue;
    }

    // Step 3 — persist alert to DynamoDB
    await context.step(`write-alert-${cameraId}`, async () => {
      const now = new Date().toISOString();
      await ddb.send(new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: { S: `ALERT#${cameraId}` },
          SK: { S: now },
          CameraId: { S: cameraId },
          HazardType: { S: hazardType },
          Severity: { S: severity },
          ImageKey: { S: imageKey },
          DetectedAt: { S: detectedAt },
        },
      }));
    });

    context.logger.info('Alert created', { cameraId, hazardType, severity });
  }

  return { status: 'completed', recordsProcessed: event.Records.length };
});
