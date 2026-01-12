import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

/**
 * DNS Stack - Creates Route 53 hosted zones and ACM certificates
 * 
 * IMPORTANT: This stack should be deployed FIRST, then:
 * 1. Copy the NS records from the stack outputs
 * 2. Update GoDaddy nameservers to point to Route 53 for each domain
 * 3. Wait 24-48 hours for propagation
 * 4. Then deploy the rest of the infrastructure
 * 
 * Domains managed:
 * - savondesigns.com (main site)
 * - savondesignsoutreach.com
 * - savondesignsmail.com
 */
export class DnsStack extends cdk.Stack {
  // savondesigns.com
  public readonly hostedZone: route53.IHostedZone;
  public readonly certificate: acm.ICertificate;

  // savondesignsoutreach.com
  public readonly outreachHostedZone: route53.IHostedZone;
  public readonly outreachCertificate: acm.ICertificate;

  // savondesignsmail.com
  public readonly mailHostedZone: route53.IHostedZone;
  public readonly mailCertificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============================================================
    // savondesigns.com - Main Domain
    // ============================================================

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
    // savondesignsoutreach.com
    // ============================================================

    this.outreachHostedZone = new route53.PublicHostedZone(this, 'OutreachHostedZone', {
      zoneName: 'savondesignsoutreach.com',
      comment: 'Hosted zone for Savon Designs Outreach - managed by CDK',
    });

    this.outreachCertificate = new acm.Certificate(this, 'OutreachCertificate', {
      domainName: 'savondesignsoutreach.com',
      subjectAlternativeNames: ['*.savondesignsoutreach.com'],
      validation: acm.CertificateValidation.fromDns(this.outreachHostedZone),
    });

    // ============================================================
    // savondesignsmail.com
    // ============================================================

    this.mailHostedZone = new route53.PublicHostedZone(this, 'MailHostedZone', {
      zoneName: 'savondesignsmail.com',
      comment: 'Hosted zone for Savon Designs Mail - managed by CDK',
    });

    this.mailCertificate = new acm.Certificate(this, 'MailCertificate', {
      domainName: 'savondesignsmail.com',
      subjectAlternativeNames: ['*.savondesignsmail.com'],
      validation: acm.CertificateValidation.fromDns(this.mailHostedZone),
    });

    // ============================================================
    // OUTPUTS - savondesigns.com
    // ============================================================

    new cdk.CfnOutput(this, 'NameServers', {
      value: cdk.Fn.join(', ', this.hostedZone.hostedZoneNameServers!),
      description: 'savondesigns.com - Copy these nameservers to GoDaddy',
      exportName: 'SavonNameServers',
    });

    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description: 'savondesigns.com - Route 53 Hosted Zone ID',
      exportName: 'SavonHostedZoneId',
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'savondesigns.com - ACM Certificate ARN',
      exportName: 'SavonCertificateArn',
    });

    // ============================================================
    // OUTPUTS - savondesignsoutreach.com
    // ============================================================

    new cdk.CfnOutput(this, 'OutreachNameServers', {
      value: cdk.Fn.join(', ', this.outreachHostedZone.hostedZoneNameServers!),
      description: 'savondesignsoutreach.com - Copy these nameservers to GoDaddy',
      exportName: 'SavonOutreachNameServers',
    });

    new cdk.CfnOutput(this, 'OutreachHostedZoneId', {
      value: this.outreachHostedZone.hostedZoneId,
      description: 'savondesignsoutreach.com - Route 53 Hosted Zone ID',
      exportName: 'SavonOutreachHostedZoneId',
    });

    new cdk.CfnOutput(this, 'OutreachCertificateArn', {
      value: this.outreachCertificate.certificateArn,
      description: 'savondesignsoutreach.com - ACM Certificate ARN',
      exportName: 'SavonOutreachCertificateArn',
    });

    // ============================================================
    // OUTPUTS - savondesignsmail.com
    // ============================================================

    new cdk.CfnOutput(this, 'MailNameServers', {
      value: cdk.Fn.join(', ', this.mailHostedZone.hostedZoneNameServers!),
      description: 'savondesignsmail.com - Copy these nameservers to GoDaddy',
      exportName: 'SavonMailNameServers',
    });

    new cdk.CfnOutput(this, 'MailHostedZoneId', {
      value: this.mailHostedZone.hostedZoneId,
      description: 'savondesignsmail.com - Route 53 Hosted Zone ID',
      exportName: 'SavonMailHostedZoneId',
    });

    new cdk.CfnOutput(this, 'MailCertificateArn', {
      value: this.mailCertificate.certificateArn,
      description: 'savondesignsmail.com - ACM Certificate ARN',
      exportName: 'SavonMailCertificateArn',
    });

    // ============================================================
    // Helpful reminder
    // ============================================================

    new cdk.CfnOutput(this, 'NextSteps', {
      value: 'Update GoDaddy nameservers for all 3 domains using the NS outputs above',
      description: 'After deploy, update GoDaddy nameservers for each domain',
    });
  }
}

