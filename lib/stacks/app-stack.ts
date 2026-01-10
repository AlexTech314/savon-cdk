import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Construct } from 'constructs';
import * as path from 'path';

export interface AppStackProps extends cdk.StackProps {
  businessesTable: dynamodb.ITable;
  jobsTable: dynamodb.ITable;
  hostedZoneId: string;
  hostedZoneName: string;
  certificateArn: string;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { businessesTable, jobsTable, hostedZoneId, hostedZoneName, certificateArn } = props;

    // Import DNS resources from the separately deployed DnsStack
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'ImportedHostedZone', {
      hostedZoneId,
      zoneName: hostedZoneName,
    });

    const certificate = acm.Certificate.fromCertificateArn(
      this, 'ImportedCertificate', certificateArn
    );

    // Domain names for alpha environment
    const uiDomain = `alpha.${hostedZoneName}`;
    const previewDomain = `preview-alpha.${hostedZoneName}`;
    const adminDomain = `admin-alpha.${hostedZoneName}`;
    const apiDomain = `api-alpha.${hostedZoneName}`;
    const authDomain = `auth-alpha.${hostedZoneName}`;

    // ============================================================
    // Secrets (Pre-existing in AWS Secrets Manager)
    // ============================================================
    const googleSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this, 'GoogleApiKey',
      'arn:aws:secretsmanager:us-east-1:328174020207:secret:GOOGLE_API_KEY-QOFLXH'
    );

    const claudeSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this, 'ClaudeApiKey',
      'arn:aws:secretsmanager:us-east-1:328174020207:secret:CLAUDE_API_KEY-MaE2LF'
    );

    // ============================================================
    // VPC for ECS Fargate Tasks (with Flow Logs for security)
    // ============================================================
    const vpcFlowLogGroup = new logs.LogGroup(this, 'VpcFlowLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const vpc = new ec2.Vpc(this, 'PipelineVpc', {
      maxAzs: 2,
      natGateways: 1, // Minimize cost
      flowLogs: {
        'FlowLog': {
          destination: ec2.FlowLogDestination.toCloudWatchLogs(vpcFlowLogGroup),
          trafficType: ec2.FlowLogTrafficType.ALL,
        },
      },
    });

    // ============================================================
    // ECS Fargate Cluster
    // ============================================================
    const cluster = new ecs.Cluster(this, 'PipelineCluster', {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    // ============================================================
    // Places Task Definition (Google Places API polling)
    // ============================================================
    const placesTaskDef = new ecs.FargateTaskDefinition(this, 'PlacesTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256, // 0.25 vCPU - lightweight!
    });

    placesTaskDef.addContainer('places', {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../../src/pipeline/places-task')),
      logging: ecs.LogDrivers.awsLogs({ 
        streamPrefix: 'places',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      secrets: {
        GOOGLE_API_KEY: ecs.Secret.fromSecretsManager(googleSecret),
      },
      environment: {
        BUSINESSES_TABLE_NAME: businessesTable.tableName,
        AWS_REGION: this.region,
      },
    });

    businessesTable.grantReadWriteData(placesTaskDef.taskRole);

    // ============================================================
    // Copy Task Definition (LLM copy generation)
    // ============================================================
    const copyTaskDef = new ecs.FargateTaskDefinition(this, 'CopyTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    copyTaskDef.addContainer('copy', {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../../src/pipeline/copy-task')),
      logging: ecs.LogDrivers.awsLogs({ 
        streamPrefix: 'copy',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      secrets: {
        CLAUDE_API_KEY: ecs.Secret.fromSecretsManager(claudeSecret),
      },
      environment: {
        BUSINESSES_TABLE_NAME: businessesTable.tableName,
        AWS_REGION: this.region,
      },
    });

    businessesTable.grantReadWriteData(copyTaskDef.taskRole);

    // ============================================================
    // Step Functions State Machine
    // ============================================================
    const runPlacesTask = new tasks.EcsRunTask(this, 'RunPlacesTask', {
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      cluster,
      taskDefinition: placesTaskDef,
      launchTarget: new tasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [{
        containerDefinition: placesTaskDef.defaultContainer!,
        environment: [
          { name: 'JOB_INPUT', value: sfn.JsonPath.stringAt('States.JsonToString($)') },
        ],
      }],
      assignPublicIp: true,
    });

    const runCopyTask = new tasks.EcsRunTask(this, 'RunCopyTask', {
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      cluster,
      taskDefinition: copyTaskDef,
      launchTarget: new tasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [{
        containerDefinition: copyTaskDef.defaultContainer!,
        environment: [
          { name: 'JOB_INPUT', value: sfn.JsonPath.stringAt('States.JsonToString($)') },
        ],
      }],
      assignPublicIp: true,
    });

    // For "both", we need a separate places task to avoid mutating the original
    const runPlacesTaskForBoth = new tasks.EcsRunTask(this, 'RunPlacesTaskForBoth', {
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      cluster,
      taskDefinition: placesTaskDef,
      launchTarget: new tasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [{
        containerDefinition: placesTaskDef.defaultContainer!,
        environment: [
          { name: 'JOB_INPUT', value: sfn.JsonPath.stringAt('States.JsonToString($)') },
        ],
      }],
      assignPublicIp: true,
    });

    const jobType = new sfn.Choice(this, 'CheckJobType')
      .when(sfn.Condition.stringEquals('$.jobType', 'places'), runPlacesTask)
      .when(sfn.Condition.stringEquals('$.jobType', 'copy'), runCopyTask)
      .when(sfn.Condition.stringEquals('$.jobType', 'both'), 
        runPlacesTaskForBoth.next(runCopyTask))
      .otherwise(new sfn.Fail(this, 'InvalidJobType', {
        error: 'InvalidJobType',
        cause: 'jobType must be "places", "copy", or "both"',
      }));

    const stateMachine = new sfn.StateMachine(this, 'PipelineStateMachine', {
      // Let CDK generate the name for uniqueness
      definitionBody: sfn.DefinitionBody.fromChainable(jobType),
      timeout: cdk.Duration.hours(2),
      tracingEnabled: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ============================================================
    // Cognito User Pool (Admin authentication)
    // ============================================================
    const userPool = new cognito.UserPool(this, 'AdminUserPool', {
      // Let CDK generate the name
      selfSignUpEnabled: false, // Admin-only
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // DESTROY for fast iteration - change to RETAIN before production!
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('ControlCenterClient', {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: [
          `https://${adminDomain}/callback`,
          'http://localhost:5173/callback',
        ],
        logoutUrls: [
          `https://${adminDomain}/`,
          'http://localhost:5173/',
        ],
      },
    });

    // Custom domain for Cognito hosted UI
    const cognitoDomain = userPool.addDomain('CognitoDomain', {
      customDomain: {
        domainName: authDomain,
        certificate: certificate,
      },
    });

    // Route 53 A record for Cognito custom domain
    new route53.ARecord(this, 'AuthARecord', {
      zone: hostedZone,
      recordName: 'auth-alpha',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.UserPoolDomainTarget(cognitoDomain)
      ),
    });

    // ============================================================
    // Lambda Functions
    // ============================================================
    const configLogGroup = new logs.LogGroup(this, 'ConfigLambdaLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const configLambda = new nodejs.NodejsFunction(this, 'ConfigLambda', {
      entry: path.join(__dirname, '../../src/config-lambda/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logGroup: configLogGroup,
      environment: {
        BUSINESSES_TABLE_NAME: businessesTable.tableName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    businessesTable.grantReadWriteData(configLambda);

    const jobsLogGroup = new logs.LogGroup(this, 'JobsLambdaLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const jobsLambda = new nodejs.NodejsFunction(this, 'JobsLambda', {
      entry: path.join(__dirname, '../../src/jobs-lambda/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logGroup: jobsLogGroup,
      environment: {
        JOBS_TABLE_NAME: jobsTable.tableName,
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    jobsTable.grantReadWriteData(jobsLambda);
    stateMachine.grantStartExecution(jobsLambda);
    stateMachine.grantRead(jobsLambda);

    // ============================================================
    // API Gateway with Custom Domain
    // ============================================================
    const authorizer = new HttpUserPoolAuthorizer('Authorizer', userPool, {
      userPoolClients: [userPoolClient],
    });

    // Create custom domain for API Gateway
    const apiDomainName = new apigwv2.DomainName(this, 'ApiDomainName', {
      domainName: apiDomain,
      certificate: certificate,
    });

    const httpApi = new apigwv2.HttpApi(this, 'Api', {
      // Let CDK generate the name
      corsPreflight: {
        allowOrigins: [
          `https://${adminDomain}`,
          `https://${previewDomain}`,
          `https://${uiDomain}`,
          'http://localhost:5173',
          'http://localhost:5174',
        ],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Authorization', 'Content-Type'],
        allowCredentials: true,
      },
      defaultDomainMapping: {
        domainName: apiDomainName,
      },
    });

    // Route 53 A record for API
    new route53.ARecord(this, 'ApiARecord', {
      zone: hostedZone,
      recordName: 'api-alpha',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          apiDomainName.regionalDomainName,
          apiDomainName.regionalHostedZoneId
        )
      ),
    });

    const configIntegration = new HttpLambdaIntegration('ConfigIntegration', configLambda);
    const jobsIntegration = new HttpLambdaIntegration('JobsIntegration', jobsLambda);

    // Public routes (preview app uses these)
    httpApi.addRoutes({
      path: '/businesses',
      methods: [apigwv2.HttpMethod.GET],
      integration: configIntegration,
    });

    httpApi.addRoutes({
      path: '/businesses/{place_id}',
      methods: [apigwv2.HttpMethod.GET],
      integration: configIntegration,
    });

    httpApi.addRoutes({
      path: '/businesses/slug/{slug}',
      methods: [apigwv2.HttpMethod.GET],
      integration: configIntegration,
    });

    // Protected routes (require Cognito auth)
    httpApi.addRoutes({
      path: '/businesses/{place_id}',
      methods: [apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE],
      integration: configIntegration,
      authorizer,
    });

    httpApi.addRoutes({
      path: '/businesses/import',
      methods: [apigwv2.HttpMethod.POST],
      integration: configIntegration,
      authorizer,
    });

    httpApi.addRoutes({
      path: '/businesses/export',
      methods: [apigwv2.HttpMethod.GET],
      integration: configIntegration,
      authorizer,
    });

    httpApi.addRoutes({
      path: '/jobs',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: jobsIntegration,
      authorizer,
    });

    httpApi.addRoutes({
      path: '/jobs/{job_id}',
      methods: [apigwv2.HttpMethod.GET],
      integration: jobsIntegration,
      authorizer,
    });

    // ============================================================
    // S3 Buckets + CloudFront Distributions with Custom Domains
    // ============================================================
    
    // Main UI - alpha.savondesigns.com
    const uiBucket = new s3.Bucket(this, 'UiBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const uiDistribution = new cloudfront.Distribution(this, 'UiDistribution', {
      defaultBehavior: { 
        origin: origins.S3BucketOrigin.withOriginAccessControl(uiBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      domainNames: [uiDomain],
      certificate: certificate,
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 404, responsePagePath: '/index.html', responseHttpStatus: 200 },
        { httpStatus: 403, responsePagePath: '/index.html', responseHttpStatus: 200 },
      ],
    });

    new route53.ARecord(this, 'UiARecord', {
      zone: hostedZone,
      recordName: 'alpha',
      target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(uiDistribution)),
    });

    // Preview App - preview-alpha.savondesigns.com
    const previewBucket = new s3.Bucket(this, 'PreviewBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const previewDistribution = new cloudfront.Distribution(this, 'PreviewDistribution', {
      defaultBehavior: { 
        origin: origins.S3BucketOrigin.withOriginAccessControl(previewBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      domainNames: [previewDomain],
      certificate: certificate,
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 404, responsePagePath: '/index.html', responseHttpStatus: 200 },
        { httpStatus: 403, responsePagePath: '/index.html', responseHttpStatus: 200 },
      ],
    });

    new route53.ARecord(this, 'PreviewARecord', {
      zone: hostedZone,
      recordName: 'preview-alpha',
      target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(previewDistribution)),
    });

    // Control Center - admin-alpha.savondesigns.com
    const adminBucket = new s3.Bucket(this, 'AdminBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const adminDistribution = new cloudfront.Distribution(this, 'AdminDistribution', {
      defaultBehavior: { 
        origin: origins.S3BucketOrigin.withOriginAccessControl(adminBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      domainNames: [adminDomain],
      certificate: certificate,
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 404, responsePagePath: '/index.html', responseHttpStatus: 200 },
        { httpStatus: 403, responsePagePath: '/index.html', responseHttpStatus: 200 },
      ],
    });

    new route53.ARecord(this, 'AdminARecord', {
      zone: hostedZone,
      recordName: 'admin-alpha',
      target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(adminDistribution)),
    });

    // ============================================================
    // S3 Bucket Deployments with CloudFront Invalidation
    // ============================================================

    // Deploy Main UI to S3
    new s3deploy.BucketDeployment(this, 'DeployUi', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../src/ui/dist'))],
      destinationBucket: uiBucket,
      distribution: uiDistribution,
      distributionPaths: ['/*'],
      prune: true,
      memoryLimit: 256,
    });

    // Deploy Preview App to S3
    new s3deploy.BucketDeployment(this, 'DeployPreview', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../src/preview-app/dist'))],
      destinationBucket: previewBucket,
      distribution: previewDistribution,
      distributionPaths: ['/*'],
      prune: true,
      memoryLimit: 256,
    });

    // Deploy Admin Control Center to S3
    new s3deploy.BucketDeployment(this, 'DeployAdmin', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../src/admin-app/dist'))],
      destinationBucket: adminBucket,
      distribution: adminDistribution,
      distributionPaths: ['/*'],
      prune: true,
      memoryLimit: 256,
    });

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: `https://${apiDomain}`,
      description: 'API Gateway custom domain endpoint',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'CognitoDomainUrl', {
      value: `https://${authDomain}`,
      description: 'Cognito Custom Auth Domain',
    });

    new cdk.CfnOutput(this, 'UiUrl', {
      value: `https://${uiDomain}`,
      description: 'Main UI URL',
    });

    new cdk.CfnOutput(this, 'PreviewUrl', {
      value: `https://${previewDomain}`,
      description: 'Preview App URL',
    });

    new cdk.CfnOutput(this, 'AdminUrl', {
      value: `https://${adminDomain}`,
      description: 'Admin Control Center URL',
    });

    new cdk.CfnOutput(this, 'UiBucketName', {
      value: uiBucket.bucketName,
      description: 'Main UI S3 bucket for deployment',
    });

    new cdk.CfnOutput(this, 'PreviewBucketName', {
      value: previewBucket.bucketName,
      description: 'Preview App S3 bucket for deployment',
    });

    new cdk.CfnOutput(this, 'AdminBucketName', {
      value: adminBucket.bucketName,
      description: 'Admin Control Center S3 bucket for deployment',
    });

    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: stateMachine.stateMachineArn,
      description: 'Step Functions State Machine ARN',
    });
  }
}
