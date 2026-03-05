import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: 'ALERT' },
      },
    }));

    const alerts = (result.Items ?? []).map((item) => ({
      id: item.SK?.S,
      cameraId: item.CameraId?.S,
      type: item.Type?.S,
      severity: item.Severity?.S,
      confidence: item.Confidence?.N ? Number(item.Confidence.N) : undefined,
      timestamp: item.Timestamp?.S,
      imageKey: item.ImageKey?.S,
    }));

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
