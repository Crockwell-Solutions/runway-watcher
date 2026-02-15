#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { RunwayWatcherStatelessStack } from '../lib/stateless-stack';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

const statelessStack = new RunwayWatcherStatelessStack(app, 'RunwayWatcherStatelessStack');

new FrontendStack(app, 'RunwayWatcherFrontendStack', {
  apiUrl: statelessStack.apiUrl,
});
