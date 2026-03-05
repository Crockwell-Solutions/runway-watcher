/*
 * CDK Stack - Stateful Resources
 *
 * This CDK stack sets up the stateful backend resources for the Runway Watcher Project.
 * This contains the DynamoDB tables for storing alerts.
 *
 * This software is licensed under the GNU General Public License v3.0.
 */

import { Stack, StackProps, Aspects } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { Table, AttributeType, StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { EnvironmentConfig, Stage, getRemovalPolicyFromStage } from '@config';
import { CustomTable } from '@constructs';

export interface RunwayWatcherStatefulStackProps extends StackProps {
  stage: Stage;
  envConfig: EnvironmentConfig;
}

export class RunwayWatcherStatefulStack extends Stack {
  // Exports from this stack
  public readonly runwayWatcherTable: Table;

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
