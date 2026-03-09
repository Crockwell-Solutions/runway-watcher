/*
 * CDK Stack - Stateless Resources
 *
 * This CDK stack sets up the stateless backend resources for the Runway Watcher Project.
 * This contains the APIs, Lambda functions and event driven resources
 *
 * This software is licensed under the GNU General Public License v3.0.
 */

import { Duration, Stack, StackProps, CfnOutput, SecretValue } from 'aws-cdk-lib/core';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as pipes from '@aws-cdk/aws-pipes-alpha';
import { ApiDestinationTarget } from '@aws-cdk/aws-pipes-targets-alpha';
import { DynamoDBSource, DynamoDBStartingPosition } from '@aws-cdk/aws-pipes-sources-alpha';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { FilterCriteria, FilterRule, StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { EnvironmentConfig, Stage } from '@config';
import { CustomLambda } from '@constructs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';

export interface RunwayWatcherStatelessStackProps extends StackProps {
  stage: Stage;
  envConfig: EnvironmentConfig;
  runwayWatcherTable: dynamodb.Table;
  cameraImagesBucketArn: string;
  cameraImagesBucketName: string;
}

export class RunwayWatcherStatelessStack extends Stack {
  public readonly apiUrl: string;
  public readonly eventsApi: appsync.EventApi;

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
      functionName: `upload-camera-images-${props.stage}`,
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

    // Lambda function to query DynamoDB for latest camera images and return presigned S3 URLs
    const getLatestImagesLambda = new CustomLambda(this, 'GetLatestImagesFunction', {
      functionName: `get-latest-images-${props.stage}`,
      source: 'backend/get-latest-images.ts',
      envConfig: props.envConfig,
      environmentVariables: {
        TABLE_NAME: props.runwayWatcherTable.tableName,
        BUCKET_NAME: props.cameraImagesBucketName,
      },
    });

    // Grant read access to DynamoDB and S3
    props.runwayWatcherTable.grantReadData(getLatestImagesLambda.lambda);
    cameraImagesBucket.grantRead(getLatestImagesLambda.lambda);

    // Lambda function to query DynamoDB for camera alerts
    const getAlertsLambda = new CustomLambda(this, 'GetAlertsFunction', {
      functionName: `get-alerts-${props.stage}`,
      source: 'backend/get-alerts.ts',
      envConfig: props.envConfig,
      environmentVariables: {
        TABLE_NAME: props.runwayWatcherTable.tableName,
        BUCKET_NAME: props.cameraImagesBucketName,
      },
    });

    props.runwayWatcherTable.grantReadData(getAlertsLambda.lambda);
    cameraImagesBucket.grantRead(getAlertsLambda.lambda);

    // Lambda function to acknowledge a camera alert
    const acknowledgeAlertLambda = new CustomLambda(this, 'AcknowledgeAlertFunction', {
      functionName: `acknowledge-alert-${props.stage}`,
      source: 'backend/acknowledge-alert.ts',
      envConfig: props.envConfig,
      environmentVariables: {
        TABLE_NAME: props.runwayWatcherTable.tableName,
      },
    });

    props.runwayWatcherTable.grantReadWriteData(acknowledgeAlertLambda.lambda);

    // Add API endpoints
    const camerasResource = api.root.addResource('cameras');
    const latestResource = camerasResource.addResource('latest');
    latestResource.addMethod('GET', new apigateway.LambdaIntegration(getLatestImagesLambda.lambda));
    const alertsResource = camerasResource.addResource('alerts');
    alertsResource.addMethod('GET', new apigateway.LambdaIntegration(getAlertsLambda.lambda));
    const acknowledgeResource = alertsResource.addResource('acknowledge');
    acknowledgeResource.addMethod('POST', new apigateway.LambdaIntegration(acknowledgeAlertLambda.lambda));
    const simulateResource = api.root.addResource('simulate-hazard');
    simulateResource.addMethod('POST', new apigateway.LambdaIntegration(uploadImagesLambda.lambda));
    const initiateResource = api.root.addResource('initiate-feeds');
    initiateResource.addMethod('POST', new apigateway.LambdaIntegration(uploadImagesLambda.lambda));

    // Durable Lambda function for multi-step hazard analysis workflow
    // Uses Converse API to call Nova Pro directly with image bytes from S3
    const novaProModelId = 'eu.amazon.nova-pro-v1:0';

    const analyseHazardLambda = new CustomLambda(this, 'AnalyseHazardDurableFunction', {
      functionName: `analyse-hazard-durable-${props.stage}`,
      source: 'backend/analyse-hazard.ts',
      envConfig: props.envConfig,
      timeout: Duration.seconds(900),
      environmentVariables: {
        TABLE_NAME: props.runwayWatcherTable.tableName,
        BUCKET_NAME: props.cameraImagesBucketName,
        BEDROCK_MODEL_ID: novaProModelId,
      },
      durableConfig: {
        executionTimeout: Duration.minutes(10),
        retentionPeriod: Duration.days(7),
      },
    });

    // Grant DynamoDB read/write for writing alert records
    props.runwayWatcherTable.grantReadWriteData(analyseHazardLambda.lambda);

    // Grant read access to camera images bucket (for Rekognition to read images)
    cameraImagesBucket.grantRead(analyseHazardLambda.lambda);

    // Grant Rekognition DetectLabels permission
    analyseHazardLambda.lambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['rekognition:DetectLabels'],
      resources: ['*'],
    }));

    // Grant permission to invoke Nova Pro via Converse API
    analyseHazardLambda.lambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-pro-v1:0`,
        `arn:aws:bedrock:eu-*::foundation-model/amazon.nova-pro-v1:0`,
        // Cross-region inference profile ARN
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${novaProModelId}`,
      ],
    }));

    // Attach the durable execution managed policy (required for checkpointing)
    analyseHazardLambda.lambda.role?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AWSLambdaBasicDurableExecutionRolePolicy',
      ),
    );

    // Create a version and alias (durable functions require qualified ARN invocation)
    const analyseHazardVersion = analyseHazardLambda.lambda.currentVersion;
    const analyseHazardAlias = new lambda.Alias(this, 'AnalyseHazardAlias', {
      aliasName: 'live',
      version: analyseHazardVersion,
    });

    // Trigger from DynamoDB Streams on NEW/MODIFIED records where PK = 'LATEST'
    // IMPORTANT: Bind to the alias, not the base function — durable functions
    // require invocation via a qualified ARN to receive the durable execution envelope.
    analyseHazardAlias.addEventSource(
      new DynamoEventSource(props.runwayWatcherTable, {
        startingPosition: StartingPosition.LATEST,
        batchSize: 1,
        retryAttempts: 1,
        filters: [
          FilterCriteria.filter({
            eventName: FilterRule.or('INSERT', 'MODIFY'),
            dynamodb: {
              NewImage: {
                PK: { S: FilterRule.isEqual('LATEST') },
              },
            },
          }),
        ],
      }),
    );

    // Create and AppSync Events API that will be used for real-time notification of new alerts to the frontend

    // Create the Lambda function that will be used for enrichment
    const alertEnrichment = new CustomLambda(this, 'AlertEnrichmentFunction', {
      functionName: `alert-enrichment-${props.stage}`,
      source: 'backend/alert-enrichment.ts',
      envConfig: props.envConfig,
    });

    // Create the AppSync Events Websocket API
    const apiKeyProvider = { authorizationType: appsync.AppSyncAuthorizationType.API_KEY };

    // Create the Appsync Events API
    this.eventsApi = new appsync.EventApi(this, 'RunwayWatcherEventsApi', {
      apiName: 'RunwayWatcherEvents',
      authorizationConfig: { authProviders: [apiKeyProvider] },
    });

    // add a channel namespace called `alerts`
    this.eventsApi.addChannelNamespace('alerts');

    // Create a new secret for the AppSync Events API Key
    const apiKeySecret = new Secret(this, 'RunwayWatcherApiKeySecret', {
      secretName: 'RunwayWatcherApiKey',
      secretStringValue: SecretValue.unsafePlainText(this.eventsApi.apiKeys['Default'].attrApiKey),
    });

    // Create an Eventbridge API destinations used for sending events to AppSync Events
    const connection = new events.Connection(this, 'RunwayWatcherAppsyncConnection', {
      authorization: events.Authorization.apiKey('x-api-key', apiKeySecret.secretValue),
      description: 'Connection with API Key x-api-key',
    });
    const runwayWatcherAppsyncDestination = new events.ApiDestination(this, 'RunwayWatcherAppsyncDestination', {
      connection,
      endpoint: `https://${this.eventsApi.httpDns}/event`,
      httpMethod: events.HttpMethod.POST,
      description: 'Calling AppSync Events API',
    });

    // Create the filter that will be used for the EventBridge Pipe
    const sourceFilter = new pipes.Filter([
      pipes.FilterPattern.fromObject({
        eventName: ['INSERT'],
        dynamodb: {
          NewImage: {
            PK: {
              S: ['ALERT'],
            },
          },
        },
      }),
    ]);

    // Create the log group used for the EventBridge Pipe
    const logGroup = new LogGroup(this, 'HazardEventsPipeLogGroup', {
      retention: RetentionDays.ONE_WEEK,
    });
    const cwlLogDestination = new pipes.CloudwatchLogsLogDestination(logGroup);

    // Create the EventBridge Pipe that will process new hazard events from DynamoDB stream and publish to AppSync Events API
    new pipes.Pipe(this, 'HazardEventsPipe', {
      source: new DynamoDBSource(props.runwayWatcherTable, {
        startingPosition: DynamoDBStartingPosition.LATEST,
        batchSize: 1,
      }),
      target: new ApiDestinationTarget(runwayWatcherAppsyncDestination),
      enrichment: new LambdaEnrichment(alertEnrichment.lambda),
      logLevel: pipes.LogLevel.TRACE,
      logIncludeExecutionData: [pipes.IncludeExecutionData.ALL],
      logDestinations: [cwlLogDestination],
      filter: sourceFilter,
    });
  }
}

class LambdaEnrichment implements pipes.IEnrichment {
  enrichmentArn: string;
  private inputTransformation: pipes.InputTransformation | undefined;

  constructor(
    private readonly lambda: lambda.Function,
    props: { inputTransformation?: pipes.InputTransformation } = {},
  ) {
    this.enrichmentArn = lambda.functionArn;
    this.inputTransformation = props?.inputTransformation;
  }

  bind(pipe: pipes.IPipe): pipes.EnrichmentParametersConfig {
    return {
      enrichmentParameters: {
        inputTemplate: this.inputTransformation?.bind(pipe).inputTemplate,
      },
    };
  }

  grantInvoke(pipeRole: iam.IRole): void {
    this.lambda.grantInvoke(pipeRole);
  }
}
