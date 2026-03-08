/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Alert Enrichment Lambda
 *
 * This Lambda function is used by EventBridge Pipes to enrich hazard events
 * before they are sent to the AppSync Events API.
 *
 */

import { unmarshall } from '@aws-sdk/util-dynamodb';

export const handler = async (event: any): Promise<any> => {
  const returnedEvents = [];

  for (const record of event) {
    // Unmarshall the DynamoDB record
    const newRecord = unmarshall(record.dynamodb.NewImage);
    console.log(`Unmarshalled DynamoDB record ${JSON.stringify(newRecord)}`);

    returnedEvents.push(
      JSON.stringify({
        type: 'Hazard',
        data: newRecord,
      }),
    );
  }

  return {
    channel: 'alerts/alert',
    events: returnedEvents,
  };
};
