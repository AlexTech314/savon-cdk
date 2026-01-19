#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';
import { DnsStack } from '../lib/stacks/dns-stack';
import { EcrCacheStack } from '../lib/stacks/ecr-cache-stack';

const app = new cdk.App();

// Account and region configuration
const env = { 
  account: '328174020207', 
  region: 'us-east-1',  // ACM certs for CloudFront must be in us-east-1
};

// ============================================================
// DNS Stack - Deploy this FIRST, then configure GoDaddy
// ============================================================
// 
// After deploying SavonDns:
// 1. Look at the 'NameServers' output
// 2. Update GoDaddy nameservers to those 4 values
// 3. Wait 24-48 hours for propagation
// 4. ACM certificate will auto-validate once DNS propagates
//
new DnsStack(app, 'SavonDns', { env });

// ============================================================
// ECR Cache Stack - Deploy SECOND (before Pipeline)
// ============================================================
//
// Sets up ECR pull-through cache for GitHub Container Registry.
// Must be deployed before Pipeline so Docker builds can use cached images.
//
// Prerequisites:
// 1. Create secret: ecr-pullthroughcache/ghcr with GHCR credentials
// 2. Seed the cache: docker pull {account}.dkr.ecr.{region}.amazonaws.com/ghcr/puppeteer/puppeteer:24.0.0
//
new EcrCacheStack(app, 'SavonEcrCache', { env });

// ============================================================
// Pipeline Stack - Deploy LAST after DNS and ECR Cache
// ============================================================
//
// Prerequisites:
// 1. Create GitHub connection in AWS Console
// 2. Set githubConnectionArn in cdk.context.json
// 3. DNS must be configured and certificate issued
// 4. ECR Cache must be deployed and seeded
//
new PipelineStack(app, 'SavonPipeline', { env });

app.synth();
