#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { RunwayWatcherStatelessStack } from '../lib/stateless-stack';
import { RunwayWatcherStatefulStack } from '../lib/stateful-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { Stage, getStage, getEnvironmentConfig } from '@config';

const stage = getStage(process.env.STAGE as Stage) as Stage;
const envConfig = getEnvironmentConfig(stage);

const app = new cdk.App();

const statefulStack = new RunwayWatcherStatefulStack(app, 'RunwayWatcherStatefulStack', {
  stage: stage,
  envConfig: envConfig,
});

const statelessStack = new RunwayWatcherStatelessStack(app, 'RunwayWatcherStatelessStack', {
  stage: stage,
  envConfig: envConfig,
  runwayWatcherTable: statefulStack.runwayWatcherTable
});

new FrontendStack(app, 'RunwayWatcherFrontendStack', {
  stage: stage,
  envConfig: envConfig,
  apiUrl: statelessStack.apiUrl,
});
