import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { AlphaStage } from './stages/alpha-stage';

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get GitHub config from context
    const githubOwner = this.node.tryGetContext('githubOwner') || 'your-github-username';
    const githubRepo = this.node.tryGetContext('githubRepo') || 'savon-cdk';
    const githubTokenSecretName = this.node.tryGetContext('githubTokenSecretName') || 'GITHUB_TOKEN';

    // Get DNS config from context (set after deploying SavonDns stack)
    const hostedZoneId = this.node.tryGetContext('hostedZoneId');
    const hostedZoneName = this.node.tryGetContext('hostedZoneName') || 'savondesigns.com';
    const certificateArn = this.node.tryGetContext('certificateArn');

    // Get Alpha stage Cognito config (set after first deployment)
    const alphaConfig = this.node.tryGetContext('alpha') || {};
    const alphaCognitoUserPoolId = alphaConfig.cognitoUserPoolId || '';
    const alphaCognitoClientId = alphaConfig.cognitoClientId || '';

    if (!hostedZoneId || !certificateArn) {
      throw new Error(
        'Missing DNS configuration. Deploy SavonDns first, then add to cdk.context.json:\n' +
        '  "hostedZoneId": "Z03712212Q6P09XXBNUOC",\n' +
        '  "certificateArn": "arn:aws:acm:us-east-1:..."'
      );
    }

    // Self-mutating CDK Pipeline
    const pipeline = new pipelines.CodePipeline(this, 'Pipeline', {
      // Let CDK generate the pipeline name
      selfMutation: true,
      
      // GitHub source using Personal Access Token from Secrets Manager
      synth: new pipelines.ShellStep('Synth', {
        input: pipelines.CodePipelineSource.gitHub(
          `${githubOwner}/${githubRepo}`,
          'main',
          {
            // Reference to the secret in Secrets Manager
            authentication: cdk.SecretValue.secretsManager(githubTokenSecretName),
          }
        ),
        env: {
          // Alpha stage Cognito config (injected at build time)
          VITE_COGNITO_USER_POOL_ID: alphaCognitoUserPoolId,
          VITE_COGNITO_CLIENT_ID: alphaCognitoClientId,
          VITE_COGNITO_DOMAIN: `auth-alpha.${hostedZoneName}`,
          VITE_API_BASE_URL: `https://api-alpha.${hostedZoneName}`,
          VITE_REDIRECT_SIGN_IN: `https://admin-alpha.${hostedZoneName}/callback`,
          VITE_REDIRECT_SIGN_OUT: `https://admin-alpha.${hostedZoneName}/`,
          // Preview app URL for main UI's iframe embedding
          VITE_PREVIEW_APP_URL: `https://preview-alpha.${hostedZoneName}`,
        },
        commands: [
          // Install and build CDK project
          'npm ci',
          'npm run build',
          
          // Build UI apps (outputs to src/*/dist/)
          'cd src/ui && npm ci && npm run build && cd ../..',
          'cd src/preview-app && npm ci && npm run build && cd ../..',
          'cd src/admin-app && npm ci && npm run build && cd ../..',
          
          // Synthesize CDK
          'npx cdk synth',
        ],
      }),
      
      // Docker builds needed for ECS Fargate tasks
      dockerEnabledForSynth: true,
      dockerEnabledForSelfMutation: true,

      // Set Node.js 22 runtime for all CodeBuild projects (required by Vite 7+)
      codeBuildDefaults: {
        partialBuildSpec: codebuild.BuildSpec.fromObject({
          phases: {
            install: {
              'runtime-versions': {
                nodejs: 22,
              },
            },
          },
        }),
      },
    });

    // Add Alpha stage - single stage for early development
    pipeline.addStage(new AlphaStage(this, 'Alpha', {
      env: { account: '328174020207', region: 'us-east-1' },
      hostedZoneId,
      hostedZoneName,
      certificateArn,
    }));
  }
}
