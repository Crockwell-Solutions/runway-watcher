import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const ddb = new DynamoDBClient({});
const s3 = new S3Client({});
const TABLE_NAME = process.env.TABLE_NAME!;
const BUCKET_NAME = process.env.BUCKET_NAME!;

export const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: 'ALERT' },
      },
      ScanIndexForward: false,
    }));

    const alerts = await Promise.all(
      (result.Items ?? []).map(async (item) => {
        const imageKey = item.Key?.S;
        let imageUrl: string | undefined;
        if (imageKey && BUCKET_NAME) {
          try {
            imageUrl = await getSignedUrl(s3, new GetObjectCommand({
              Bucket: BUCKET_NAME,
              Key: imageKey,
            }), { expiresIn: 900 });
          } catch {
            // skip if presigning fails
          }
        }

        return {
          id: item.SK?.S,
          cameraId: item.CameraId?.S,
          hazardType: item.HazardType?.S,
          severity: item.Severity?.S,
          description: item.Description?.S,
          imageKey,
          imageUrl,
          detectedAt: item.DetectedAt?.S,
          processedAt: item.ProcessedAt?.S,
          processingTime: item.ProcessingTime?.N ? Number(item.ProcessingTime.N) : undefined,
          acknowledged: item.Acknowledged?.BOOL ?? false,
          acknowledgedAt: item.AcknowledgedAt?.S,
        };
      })
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ alerts }),
    };
  } catch (error) {
    console.error('Failed to get alerts', error);
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
