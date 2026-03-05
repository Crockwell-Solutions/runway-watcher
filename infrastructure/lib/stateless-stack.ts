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
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { EnvironmentConfig, Stage } from '@config';
import { CustomLambda } from '@constructs';

export interface RunwayWatcherStatelessStackProps extends StackProps {
  stage: Stage;
  envConfig: EnvironmentConfig;
  runwayWatcherTable: dynamodb.Table;
  cameraImagesBucketArn: string;
  cameraImagesBucketName: string;
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

    // Import the camera images bucket by name/ARN to avoid cross-stack circular dependency
    const cameraImagesBucket = s3.Bucket.fromBucketAttributes(this, 'ImportedCameraImagesBucket', {
      bucketArn: props.cameraImagesBucketArn,
      bucketName: props.cameraImagesBucketName,
    });

    // Lambda function to upload camera images to S3 on a schedule
    const uploadImagesLambda = new CustomLambda(this, 'UploadImagesFunction', {
      functionName: 'UploadCameraImagesFunction',
      source: 'backend/upload-images.ts',
      envConfig: props.envConfig,
      environmentVariables: {
        BUCKET_NAME: props.cameraImagesBucketName,
      },
      copyDirectory: 'resources/camera-images'
    });

    // Grant the Lambda write access to the camera images bucket
    cameraImagesBucket.grantWrite(uploadImagesLambda.lambda);

    // EventBridge rule to trigger the Lambda every minute
    new events.Rule(this, 'UploadImagesSchedule', {
      schedule: events.Schedule.rate(Duration.minutes(1)),
      targets: [new targets.LambdaFunction(uploadImagesLambda.lambda)],
    });

    // Lambda function to process uploaded camera images and write to DynamoDB
    const processImageLambda = new CustomLambda(this, 'ProcessImageFunction', {
      functionName: `process-image-${props.stage}`,
      source: 'backend/process-image.ts',
      envConfig: props.envConfig,
      environmentVariables: {
        TABLE_NAME: props.runwayWatcherTable.tableName,
      },
    });

    // Grant the Lambda write access to the DynamoDB table
    props.runwayWatcherTable.grantWriteData(processImageLambda.lambda);

    // Use EventBridge to trigger the Lambda when objects are created in the camera images bucket.
    // This avoids the cross-stack circular dependency that S3 event notifications would create.
    new events.Rule(this, 'ProcessImageOnUpload', {
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [props.cameraImagesBucketName],
          },
        },
      },
      targets: [new targets.LambdaFunction(processImageLambda.lambda)],
    });
  }
}
