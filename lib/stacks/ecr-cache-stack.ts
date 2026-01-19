import * as cdk from 'aws-cdk-lib';
import { DefaultStackSynthesizer } from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class EcrCacheStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============================================================
    // ECR Pull-Through Cache for GitHub Container Registry
    // ============================================================
    // 
    // PREREQUISITE: Create the secret manually with the REQUIRED prefix:
    //
    // aws secretsmanager create-secret \
    //   --name ecr-pullthroughcache/ghcr \
    //   --secret-string '{"username":"YOUR_GITHUB_USERNAME","accessToken":"ghp_YOUR_PAT"}'
    //
    // The secret MUST have the "ecr-pullthroughcache/" prefix per AWS requirements.
    //
    // Images from ghcr.io will be cached at:
    // {account}.dkr.ecr.{region}.amazonaws.com/ghcr/...
    //
    // Example: ghcr.io/puppeteer/puppeteer:24.0.0 becomes
    // 328174020207.dkr.ecr.us-east-1.amazonaws.com/ghcr/puppeteer/puppeteer:24.0.0

    const ghcrSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'GhcrSecret',
      'ecr-pullthroughcache/ghcr'
    );

    new ecr.CfnPullThroughCacheRule(this, 'GhcrCache', {
      ecrRepositoryPrefix: 'ghcr',
      upstreamRegistry: 'github-container-registry',
      upstreamRegistryUrl: 'ghcr.io',
      credentialArn: ghcrSecret.secretArn,
    });

    // ============================================================
    // Registry Policy for Pull-Through Cache Access
    // ============================================================
    // The CDK Pipeline's asset publishing assumes the bootstrap image-publishing role.
    // We use a Registry Policy to grant access to ghcr/* repos.
    // Reference: https://garbe.io/blog/2024/04/09/bypass-docker-hub-rate-limits-with-ecr-pullthrough-cache/
    
    // Use CDK's default bootstrap qualifier to construct the role ARN
    const qualifier = DefaultStackSynthesizer.DEFAULT_QUALIFIER;
    const imagePublishingRoleArn = `arn:aws:iam::${this.account}:role/cdk-${qualifier}-image-publishing-role-${this.account}-${this.region}`;

    new ecr.CfnRegistryPolicy(this, 'PullThroughCacheRegistryPolicy', {
      policyText: {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowPullThroughCacheOperations',
            Effect: 'Allow',
            Principal: {
              AWS: imagePublishingRoleArn,
            },
            Action: [
              // Registry-level operations for pull-through cache
              'ecr:BatchImportUpstreamImage',
              'ecr:CreateRepository',
            ],
            Resource: `arn:aws:ecr:${this.region}:${this.account}:repository/ghcr/*`,
          },
        ],
      },
    });

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'EcrRegistry', {
      value: `${this.account}.dkr.ecr.${this.region}.amazonaws.com`,
      description: 'ECR registry URL for pull-through cache',
    });

    new cdk.CfnOutput(this, 'GhcrPrefix', {
      value: `${this.account}.dkr.ecr.${this.region}.amazonaws.com/ghcr`,
      description: 'ECR prefix for GitHub Container Registry images',
    });
  }
}
