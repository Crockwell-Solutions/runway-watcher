/*
 * CDK Stack - Stateful Resources
 *
 * This CDK stack sets up the stateful backend resources for the Runway Watcher Project.
 * This contains the DynamoDB tables for storing alerts.
 *
 * This software is licensed under the GNU General Public License v3.0.
 */

import { Stack, StackProps, Aspects, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { Table, AttributeType, StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { Bucket, BlockPublicAccess, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { EnvironmentConfig, Stage, getRemovalPolicyFromStage } from '@config';
import { CustomTable } from '@constructs';

export interface RunwayWatcherStatefulStackProps extends StackProps {
  stage: Stage;
  envConfig: EnvironmentConfig;
}

export class RunwayWatcherStatefulStack extends Stack {
  // Exports from this stack
  public readonly runwayWatcherTable: Table;
  public readonly cameraImagesBucket: Bucket;

  constructor(scope: Construct, id: string, props: RunwayWatcherStatefulStackProps) {
    super(scope, id, props);
    const { stage, envConfig } = props;

    // Define a DynamoDB table that will be used to store the alert data
    this.runwayWatcherTable = new CustomTable(this, 'RunwayWatcherTable', {
      tableName: envConfig.dataTableName,
      stageName: stage,
      removalPolicy: getRemovalPolicyFromStage(stage),
      partitionKey: {
        name: 'PK',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: AttributeType.STRING,
      },
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
    }).table;

    // S3 bucket for camera images with 1-day lifecycle expiration
    this.cameraImagesBucket = new Bucket(this, 'CameraImagesBucket', {
      removalPolicy: getRemovalPolicyFromStage(stage),
      autoDeleteObjects: stage !== Stage.prod,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      eventBridgeEnabled: true,
      lifecycleRules: [
        {
          expiration: Duration.days(1),
        },
      ],
    });

    // cdk nag check and suppressions
    Aspects.of(this).add(new AwsSolutionsChecks({ verbose: true }));
    NagSuppressions.addStackSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-S1',
          reason: 'Server access logging is not required for this stack',
        },
        {
          id: 'AwsSolutions-S10',
          reason: 'Use of SSL is not required for this stack',
        },
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Use of managed policies is not required for this stack',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Use of wildcard policies has been accepted for this stack',
        },
        {
          id: 'AwsSolutions-L1',
          reason: 'Lambda function is use the latest runtime and is not using deprecated features',
        },
      ],
      true,
    );
  }
}
