import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body ?? '{}');
    const alertId: string | undefined = body.alertId;

    if (!alertId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: 'alertId is required' }),
      };
    }

    await ddb.send(new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: { S: 'ALERT' },
        SK: { S: alertId },
      },
      UpdateExpression: 'SET #ack = :ack, #ackAt = :ackAt',
      ExpressionAttributeNames: {
        '#ack': 'Acknowledged',
        '#ackAt': 'AcknowledgedAt',
      },
      ExpressionAttributeValues: {
        ':ack': { BOOL: true },
        ':ackAt': { S: new Date().toISOString() },
      },
      ConditionExpression: 'attribute_exists(PK)',
    }));

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'Alert acknowledged', alertId }),
    };
  } catch (error: unknown) {
    const name = (error as { name?: string })?.name;
    if (name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: 'Alert not found' }),
      };
    }
    console.error('Failed to acknowledge alert', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
