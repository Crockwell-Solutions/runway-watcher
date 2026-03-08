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
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as bedrock from '@aws-cdk/aws-bedrock-alpha';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { FilterCriteria, FilterRule, StartingPosition } from 'aws-cdk-lib/aws-lambda';
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
      },
    });

    props.runwayWatcherTable.grantReadData(getAlertsLambda.lambda);

    // Add API endpoints
    const camerasResource = api.root.addResource('cameras');
    const latestResource = camerasResource.addResource('latest');
    latestResource.addMethod('GET', new apigateway.LambdaIntegration(getLatestImagesLambda.lambda));
    const alertsResource = camerasResource.addResource('alerts');
    alertsResource.addMethod('GET', new apigateway.LambdaIntegration(getAlertsLambda.lambda));
    const simulateResource = api.root.addResource('simulate-hazard');
    simulateResource.addMethod('POST', new apigateway.LambdaIntegration(uploadImagesLambda.lambda));
    const initiateResource = api.root.addResource('initiate-feeds');
    initiateResource.addMethod('POST', new apigateway.LambdaIntegration(uploadImagesLambda.lambda));

    // Action group Lambda — fetches camera images from S3 for the Bedrock Agent
    const fetchCameraImageLambda = new CustomLambda(this, 'FetchCameraImageFunction', {
      functionName: `fetch-camera-image-${props.stage}`,
      source: 'backend/fetch-camera-image.ts',
      envConfig: props.envConfig,
    });
    cameraImagesBucket.grantRead(fetchCameraImageLambda.lambda);

    // Define the action group function schema
    const cameraImageFunctionSchema = new bedrock.FunctionSchema({
      functions: [
        {
          name: 'fetchCameraImage',
          description:
            'Fetches camera image metadata from S3 including file size, content type, camera ID, and last modified time. ' +
            'Use this to gather additional context about the camera image when assessing hazards.',
          parameters: {
            bucketName: {
              type: bedrock.ParameterType.STRING,
              required: true,
              description: 'The S3 bucket name where the camera image is stored',
            },
            imageKey: {
              type: bedrock.ParameterType.STRING,
              required: true,
              description: 'The S3 object key of the camera image',
            },
          },
          requireConfirmation: bedrock.RequireConfirmation.DISABLED,
        },
      ],
    });

    const cameraImageActionGroup = new bedrock.AgentActionGroup({
      name: 'fetchs3',
      description: 'Tools for fetching camera image metadata from S3',
      executor: bedrock.ActionGroupExecutor.fromLambda(fetchCameraImageLambda.lambda),
      functionSchema: cameraImageFunctionSchema,
      enabled: true,
    });

    // Cross-region inference profile for Nova Pro (not available as single-region in eu-west-1)
    const novaProCrossRegion = bedrock.CrossRegionInferenceProfile.fromConfig({
      geoRegion: bedrock.CrossRegionInferenceProfileRegion.EU,
      model: bedrock.BedrockFoundationModel.AMAZON_NOVA_PRO_V1,
    });

    // Bedrock Agent for hazard severity assessment
    const hazardAssessmentAgent = new bedrock.Agent(this, 'HazardAssessmentAgent', {
      foundationModel: novaProCrossRegion,
      instruction:
        'You are an airport runway safety expert. You will be given a hazard type and Rekognition labels from a camera image analysis. ' +
        'You may use the fetchs3 tool to get additional metadata about the image and the pre-signed URL ' +
        'Use the pre-signed URL to get the actual image' +
        'Based on the Rekognition labels and any metadata, assess the severity and provide a description. ' +
        'You should assess the image independently of the labels, and determine if it is a real hazard.\n' +
        'In particular, look out for birds, drones in the picture and look out for any debris or mechanical parts (e.g. wheels) on the runway\n' + 
        'If you cannot determine a severity, respond with severity "info" and a description of the image content.\n' +
        'For the purposes of image recognition, UAVs should be considered as drones\n' + 
        'If the rekognition hazard type is "vehicle", you should assess to see if there is actually an drone/UAV in the picture. If so, that should take precedence as the hazard\n' +
        'Respond ONLY with valid JSON in this exact format: {"severity":"critical|high|info|none","hazard":"bird|drone|vehicle|debris|unknown|none","description":"<one sentence description>"}. ' +
        'Severity guidelines: ' +
        '- "critical": drones, unauthorized vehicles, or persons on the runway — immediate danger to aircraft operations. ' +
        '- "high": debris, foreign objects, or large animals — significant risk requiring prompt action. birds or small wildlife ' +
        'The description should mention the specific hazard, camera location, and potential impact on runway operations.',
      shouldPrepareAgent: true,
      actionGroups: [cameraImageActionGroup],
    });

    // Ensure the agent's role can invoke the cross-region inference profile
    hazardAssessmentAgent.role.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        novaProCrossRegion.inferenceProfileArn,
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-pro-v1:0`,
      ],
    }));

    const hazardAgentAlias = new bedrock.AgentAlias(this, 'HazardAssessmentAgentAlias', {
      agent: hazardAssessmentAgent,
      agentAliasName: 'live',
      description: 'Points to latest prepared agent version - Nova Pro EU cross-region',
    });

    // Durable Lambda function for multi-step hazard analysis workflow
    const analyseHazardLambda = new CustomLambda(this, 'AnalyseHazardDurableFunction', {
      functionName: `analyse-hazard-durable-${props.stage}`,
      source: 'backend/analyse-hazard.ts',
      envConfig: props.envConfig,
      timeout: Duration.seconds(900),
      environmentVariables: {
        TABLE_NAME: props.runwayWatcherTable.tableName,
        BUCKET_NAME: props.cameraImagesBucketName,
        BEDROCK_AGENT_ID: hazardAssessmentAgent.agentId,
        BEDROCK_AGENT_ALIAS_ID: hazardAgentAlias.aliasId,
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

    // Grant permission to invoke the Bedrock Agent
    analyseHazardLambda.lambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeAgent'],
      resources: [
        hazardAssessmentAgent.agentArn,
        hazardAgentAlias.aliasArn,
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
  }
}
