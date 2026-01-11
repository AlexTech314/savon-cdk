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
  campaignsTable: dynamodb.ITable;
  hostedZoneId: string;
  hostedZoneName: string;
  certificateArn: string;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { businessesTable, jobsTable, campaignsTable, hostedZoneId, hostedZoneName, certificateArn } = props;

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
    // Search Task Definition (Google Places Text Search - Pro tier)
    // ============================================================
    const searchTaskDef = new ecs.FargateTaskDefinition(this, 'SearchTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    searchTaskDef.addContainer('search', {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../../src/pipeline/search-task')),
      logging: ecs.LogDrivers.awsLogs({ 
        streamPrefix: 'search',
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

    businessesTable.grantReadWriteData(searchTaskDef.taskRole);

    // ============================================================
    // Details Task Definition (Google Places Details - Enterprise tier)
    // ============================================================
    const detailsTaskDef = new ecs.FargateTaskDefinition(this, 'DetailsTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    detailsTaskDef.addContainer('details', {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../../src/pipeline/details-task')),
      logging: ecs.LogDrivers.awsLogs({ 
        streamPrefix: 'details',
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

    businessesTable.grantReadWriteData(detailsTaskDef.taskRole);

    // ============================================================
    // Enrich Task Definition (Google Places Reviews - Enterprise+Atmosphere tier)
    // ============================================================
    const enrichTaskDef = new ecs.FargateTaskDefinition(this, 'EnrichTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    enrichTaskDef.addContainer('enrich', {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../../src/pipeline/enrich-task')),
      logging: ecs.LogDrivers.awsLogs({ 
        streamPrefix: 'enrich',
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

    businessesTable.grantReadWriteData(enrichTaskDef.taskRole);

    // ============================================================
    // Photos Task Definition (Google Places Photos)
    // ============================================================
    const photosTaskDef = new ecs.FargateTaskDefinition(this, 'PhotosTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    photosTaskDef.addContainer('photos', {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../../src/pipeline/photos-task')),
      logging: ecs.LogDrivers.awsLogs({ 
        streamPrefix: 'photos',
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

    businessesTable.grantReadWriteData(photosTaskDef.taskRole);

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
    // Step Functions State Machine (Task Flag Pattern)
    // ============================================================
    
    // Task definitions for each pipeline step
    const runSearchTask = new tasks.EcsRunTask(this, 'RunSearchTask', {
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      cluster,
      taskDefinition: searchTaskDef,
      launchTarget: new tasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [{
        containerDefinition: searchTaskDef.defaultContainer!,
        environment: [
          { name: 'JOB_INPUT', value: sfn.JsonPath.stringAt('States.JsonToString($)') },
        ],
      }],
      assignPublicIp: true,
      resultPath: '$.searchResult',
    });

    const runDetailsTask = new tasks.EcsRunTask(this, 'RunDetailsTask', {
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      cluster,
      taskDefinition: detailsTaskDef,
      launchTarget: new tasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [{
        containerDefinition: detailsTaskDef.defaultContainer!,
        environment: [
          { name: 'JOB_INPUT', value: sfn.JsonPath.stringAt('States.JsonToString($)') },
        ],
      }],
      assignPublicIp: true,
      resultPath: '$.detailsResult',
    });

    const runEnrichTask = new tasks.EcsRunTask(this, 'RunEnrichTask', {
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      cluster,
      taskDefinition: enrichTaskDef,
      launchTarget: new tasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [{
        containerDefinition: enrichTaskDef.defaultContainer!,
        environment: [
          { name: 'JOB_INPUT', value: sfn.JsonPath.stringAt('States.JsonToString($)') },
        ],
      }],
      assignPublicIp: true,
      resultPath: '$.enrichResult',
    });

    const runPhotosTask = new tasks.EcsRunTask(this, 'RunPhotosTask', {
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      cluster,
      taskDefinition: photosTaskDef,
      launchTarget: new tasks.EcsFargateLaunchTarget({
        platformVersion: ecs.FargatePlatformVersion.LATEST,
      }),
      containerOverrides: [{
        containerDefinition: photosTaskDef.defaultContainer!,
        environment: [
          { name: 'JOB_INPUT', value: sfn.JsonPath.stringAt('States.JsonToString($)') },
        ],
      }],
      assignPublicIp: true,
      resultPath: '$.photosResult',
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
      resultPath: '$.copyResult',
    });

    // End state
    const pipelineComplete = new sfn.Succeed(this, 'PipelineComplete');

    // Build the state machine with task flag checks
    // Each step checks if its flag is set and proceeds accordingly
    
    const checkCopy = new sfn.Choice(this, 'CheckRunCopy')
      .when(sfn.Condition.booleanEquals('$.runCopy', true), runCopyTask.next(pipelineComplete))
      .otherwise(pipelineComplete);

    const checkPhotos = new sfn.Choice(this, 'CheckRunPhotos')
      .when(sfn.Condition.booleanEquals('$.runPhotos', true), runPhotosTask.next(checkCopy))
      .otherwise(checkCopy);

    const checkEnrich = new sfn.Choice(this, 'CheckRunEnrich')
      .when(sfn.Condition.booleanEquals('$.runEnrich', true), runEnrichTask.next(checkPhotos))
      .otherwise(checkPhotos);

    const checkDetails = new sfn.Choice(this, 'CheckRunDetails')
      .when(sfn.Condition.booleanEquals('$.runDetails', true), runDetailsTask.next(checkEnrich))
      .otherwise(checkEnrich);

    const checkSearch = new sfn.Choice(this, 'CheckRunSearch')
      .when(sfn.Condition.booleanEquals('$.runSearch', true), runSearchTask.next(checkDetails))
      .otherwise(checkDetails);

    const stateMachine = new sfn.StateMachine(this, 'PipelineStateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(checkSearch),
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

    const configLambda = new lambda.DockerImageFunction(this, 'ConfigLambda', {
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, '../../src/config-lambda')
      ),
      timeout: cdk.Duration.seconds(60), // Increased for LLM and API calls
      memorySize: 512,
      logGroup: configLogGroup,
      environment: {
        BUSINESSES_TABLE_NAME: businessesTable.tableName,
        CLAUDE_API_KEY: claudeSecret.secretValue.unsafeUnwrap(),
        GOOGLE_API_KEY: googleSecret.secretValue.unsafeUnwrap(),
      },
    });

    businessesTable.grantReadWriteData(configLambda);
    claudeSecret.grantRead(configLambda);
    googleSecret.grantRead(configLambda);

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
        CAMPAIGNS_TABLE_NAME: campaignsTable.tableName,
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    jobsTable.grantReadWriteData(jobsLambda);
    campaignsTable.grantReadWriteData(jobsLambda);
    stateMachine.grantStartExecution(jobsLambda);
    stateMachine.grantRead(jobsLambda);

    // Campaigns Lambda
    const campaignsLogGroup = new logs.LogGroup(this, 'CampaignsLambdaLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const campaignsLambda = new nodejs.NodejsFunction(this, 'CampaignsLambda', {
      entry: path.join(__dirname, '../../src/campaigns-lambda/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logGroup: campaignsLogGroup,
      environment: {
        CAMPAIGNS_TABLE_NAME: campaignsTable.tableName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    campaignsTable.grantReadWriteData(campaignsLambda);

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
    const campaignsIntegration = new HttpLambdaIntegration('CampaignsIntegration', campaignsLambda);

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
      path: '/businesses/{place_id}/generate-copy',
      methods: [apigwv2.HttpMethod.POST],
      integration: configIntegration,
      authorizer,
    });

    httpApi.addRoutes({
      path: '/businesses/{place_id}/generate-details',
      methods: [apigwv2.HttpMethod.POST],
      integration: configIntegration,
      authorizer,
    });

    httpApi.addRoutes({
      path: '/businesses/{place_id}/generate-reviews',
      methods: [apigwv2.HttpMethod.POST],
      integration: configIntegration,
      authorizer,
    });

    httpApi.addRoutes({
      path: '/businesses/{place_id}/generate-photos',
      methods: [apigwv2.HttpMethod.POST],
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

    // Campaigns routes (all protected)
    httpApi.addRoutes({
      path: '/campaigns',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: campaignsIntegration,
      authorizer,
    });

    httpApi.addRoutes({
      path: '/campaigns/{campaign_id}',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE],
      integration: campaignsIntegration,
      authorizer,
    });

    httpApi.addRoutes({
      path: '/campaigns/{campaign_id}/run',
      methods: [apigwv2.HttpMethod.PATCH],
      integration: campaignsIntegration,
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
