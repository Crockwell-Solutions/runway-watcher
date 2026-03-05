import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const ddb = new DynamoDBClient({});
const s3 = new S3Client({});
const TABLE_NAME = process.env.TABLE_NAME!;
const BUCKET_NAME = process.env.BUCKET_NAME!;
const URL_EXPIRY_SECONDS = 3600; // 1 hour

export const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: 'LATEST' },
      },
    }));

    const cameras = await Promise.all(
      (result.Items ?? []).map(async (item) => {
        const key = item.Key?.S;
        if (!key) return null;

        const presignedUrl = await getSignedUrl(s3, new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        }), { expiresIn: URL_EXPIRY_SECONDS });

        return {
          cameraId: item.SK?.S,
          key,
          timestamp: item.Timestamp?.S,
          imageUrl: presignedUrl,
        };
      }),
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ cameras: cameras.filter(Boolean) }),
    };
  } catch (error) {
    console.error('Failed to get latest images', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
