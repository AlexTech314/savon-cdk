import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

/**
 * DNS Stack - Creates Route 53 hosted zone and ACM certificate
 * 
 * IMPORTANT: This stack should be deployed FIRST, then:
 * 1. Copy the NS records from the stack outputs
 * 2. Update GoDaddy nameservers to point to Route 53
 * 3. Wait 24-48 hours for propagation
 * 4. Then deploy the rest of the infrastructure
 */
export class DnsStack extends cdk.Stack {
  public readonly hostedZone: route53.IHostedZone;
  public readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create the hosted zone for savondesigns.com
    // Route 53 will automatically create NS and SOA records
    this.hostedZone = new route53.PublicHostedZone(this, 'SavonHostedZone', {
      zoneName: 'savondesigns.com',
      comment: 'Hosted zone for Savon Designs - managed by CDK',
    });

    // Request wildcard certificate for all subdomains
    // Uses DNS validation which Route 53 can auto-create records for
    this.certificate = new acm.Certificate(this, 'SavonCertificate', {
      domainName: 'savondesigns.com',
      subjectAlternativeNames: ['*.savondesigns.com'],
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // ============================================================
    // OUTPUTS - You'll need these for GoDaddy configuration
    // ============================================================

    // Output the 4 NS records that need to be configured in GoDaddy
    new cdk.CfnOutput(this, 'NameServers', {
      value: cdk.Fn.join(', ', this.hostedZone.hostedZoneNameServers!),
      description: 'Copy these 4 nameservers to GoDaddy DNS settings',
      exportName: 'SavonNameServers',
    });

    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description: 'Route 53 Hosted Zone ID',
      exportName: 'SavonHostedZoneId',
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'ACM Certificate ARN for CloudFront/API Gateway',
      exportName: 'SavonCertificateArn',
    });

    // Helpful reminder in the outputs
    new cdk.CfnOutput(this, 'NextSteps', {
      value: 'See console output for GoDaddy configuration instructions',
      description: 'After deploy, update GoDaddy nameservers',
    });
  }
}

