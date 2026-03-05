import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

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
  // Extract camera ID from key prefix: camera-x/yyyy/mm/dd/camera-x-timestamp.jpg
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
};
