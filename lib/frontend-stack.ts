/*
 * CDK Stack - Frontend Resources
 *
 * This CDK stack sets up the frontend resources for the RunwayWatcher.
 * This contains the S3 bucket for hosting the React application and the CloudFront distribution for serving it.
 *
 * This software is licensed under the GNU General Public License v3.0.
 */

import { Construct } from 'constructs';
import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Distribution, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { execSync } from 'child_process';
import * as path from 'path';

export interface FrontendStackProps extends StackProps {
  /** The API Gateway URL from the stateless stack */
  apiUrl: string;
}

export class FrontendStack extends Stack {
  public distribution: Distribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // Create an S3 bucket to host the React application
    const websiteBucket = new Bucket(this, 'RunwayWatcherWebsiteBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Create CloudFront distribution
    this.distribution = new Distribution(this, 'RunwayWatcherWebsiteDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // Build and deploy the React application (excluding config.js — deployed separately)
    const frontendPath = path.join(__dirname, '../frontend');

    const websiteDeployment = new BucketDeployment(this, 'WebsiteDeployment', {
      sources: [
        Source.asset(frontendPath, {
          bundling: {
            image: cdk.DockerImage.fromRegistry('node:22'),
            command: ['bash', '-c', 'npm ci && npm run build && rm -f dist/config.js && cp -r dist/* /asset-output/'],
            local: {
              tryBundle(outputDir: string): boolean {
                execSync('npm ci && npm run build', {
                  cwd: frontendPath,
                  stdio: 'inherit',
                });
                // Remove the local dev config.js from the build output
                const distPath = path.join(frontendPath, 'dist');
                execSync(`rm -f ${path.join(distPath, 'config.js')}`);
                execSync(`cp -r ${distPath}/* ${outputDir}`, {
                  stdio: 'inherit',
                });
                return true;
              },
            },
          },
        }),
      ],
      destinationBucket: websiteBucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      prune: false,
    });

    // Write runtime config with the real API URL directly to S3.
    // Uses AwsCustomResource instead of BucketDeployment because the apiUrl
    // is a CloudFormation token — AwsCustomResource resolves it at deploy time
    // and always executes the PutObject call.
    const configBody = cdk.Fn.sub(
      'window.__RUNTIME_CONFIG__ = {"apiUrl":"${ApiUrl}"};',
      { ApiUrl: props.apiUrl },
    );

    const configUpload = new AwsCustomResource(this, 'ConfigDeployment', {
      onUpdate: {
        service: 'S3',
        action: 'putObject',
        parameters: {
          Bucket: websiteBucket.bucketName,
          Key: 'config.js',
          Body: configBody,
          ContentType: 'application/javascript',
        },
        physicalResourceId: PhysicalResourceId.of(`config-${Date.now()}`),
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: [websiteBucket.arnForObjects('config.js')],
      }),
    });

    configUpload.node.addDependency(websiteDeployment);

    // Output the CloudFront distribution domain name
    this.exportValue(this.distribution.distributionDomainName, {
      name: 'RunwayWatcherCloudFrontDistributionDomainName',
      description: 'The domain name of the CloudFront distribution for the Runway Watcher Service',
    });
  }
}
