/*
 * CDK Stack - Stateless Resources
 *
 * This CDK stack sets up the stateless backend resources for the Runway Watcher Project.
 * This contains the APIs, Lambda functions and event driven resources
 *
 * This software is licensed under the GNU General Public License v3.0.
 */

import { Duration, Stack, StackProps, CfnOutput } from 'aws-cdk-lib/core';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { EnvironmentConfig, Stage } from '@config';

export interface RunwayWatcherStatelessStackProps extends StackProps {
  stage: Stage;
  envConfig: EnvironmentConfig;
  runwayWatcherTable: dynamodb.Table;
}

export class RunwayWatcherStatelessStack extends Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: RunwayWatcherStatelessStackProps) {
    super(scope, id, props);

    const queue = new sqs.Queue(this, 'RunwayWatcherQueue', {
      visibilityTimeout: Duration.seconds(300),
    });

    const topic = new sns.Topic(this, 'RunwayWatcherTopic');
    topic.addSubscription(new subs.SqsSubscription(queue));

    // API Gateway
    const api = new apigateway.RestApi(this, 'RunwayWatcherApi', {
      restApiName: 'RunwayWatcher API',
      description: 'API for the RunwayWatcher service',
      deployOptions: {
        stageName: 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Placeholder mock integration — replace with your Lambda integrations
    api.root.addMethod('GET', new apigateway.MockIntegration({
      integrationResponses: [{ statusCode: '200' }],
      requestTemplates: { 'application/json': '{"statusCode": 200}' },
    }), {
      methodResponses: [{ statusCode: '200' }],
    });

    this.apiUrl = api.url;

    new CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'RunwayWatcher API Gateway URL',
    });
  }
}
