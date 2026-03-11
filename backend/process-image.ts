import { DynamoDBClient, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;

/**
 * EventBridge S3 "Object Created" event detail shape.
 */
interface S3ObjectCreatedDetail {
  bucket: { name: string };
  object: { key: string; size: number; etag: string };
  reason: string;
}

interface EventBridgeS3Event {
  detail: S3ObjectCreatedDetail;
}

export const handler = async (event: EventBridgeS3Event): Promise<void> => {
  const key = event.detail.object.key;
  // Extract camera ID from key prefix: camera-x/yyyy/mm/dd/camera-x-timestamp.jpeg
  const cameraId = key.split('/')[0];
  const sortKey = cameraId.toUpperCase().replace('-', '');

  const now = new Date().toISOString();

  console.log(`Processing image for ${cameraId}: ${key}`);

  await ddb.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: { S: 'LATEST' },
      SK: { S: sortKey },
      Key: { S: key },
      Timestamp: { S: now },
    },
  }));

  console.log(`Written record PK=LATEST, SK=${sortKey} for ${key}`);

  // Mark existing alerts for this camera as cleared so map/camera views reset to green.
  // Alerts remain in DynamoDB for history and acknowledgement in the sidebar.
  const alertResult = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    FilterExpression: 'CameraId = :cameraId AND attribute_not_exists(Cleared)',
    ExpressionAttributeValues: {
      ':pk': { S: 'ALERT' },
      ':cameraId': { S: cameraId },
    },
    ProjectionExpression: 'PK, SK',
  }));

  const alertItems = alertResult.Items ?? [];
  if (alertItems.length > 0) {
    await Promise.all(alertItems.map(item =>
      ddb.send(new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { PK: item.PK!, SK: item.SK! },
        UpdateExpression: 'SET Cleared = :c, ClearedAt = :t',
        ExpressionAttributeValues: {
          ':c': { BOOL: true },
          ':t': { S: now },
        },
      }))
    ));
    console.log(`Cleared ${alertItems.length} alert(s) for ${cameraId}`);
  }
};
