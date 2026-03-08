import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const lambda = new LambdaClient({});
const UPLOAD_FUNCTION_NAME = process.env.UPLOAD_FUNCTION_NAME!;

export const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await lambda.send(new InvokeCommand({
      FunctionName: UPLOAD_FUNCTION_NAME,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({ type: 'initiate' })),
    }));

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ message: 'Feed initiation triggered' }),
    };
  } catch (err) {
    console.error('Failed to invoke upload-images Lambda', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Failed to trigger feed initiation' }),
    };
  }
};
