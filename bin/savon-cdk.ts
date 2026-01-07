#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';
import { DnsStack } from '../lib/stacks/dns-stack';

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
// Pipeline Stack - Deploy after DNS is configured
// ============================================================
//
// Prerequisites:
// 1. Create GitHub connection in AWS Console
// 2. Set githubConnectionArn in cdk.context.json
// 3. DNS must be configured and certificate issued
//
new PipelineStack(app, 'SavonPipeline', { env });

app.synth();
