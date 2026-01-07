import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class StatefulStack extends cdk.Stack {
  public readonly businessesTable: dynamodb.Table;
  public readonly jobsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============================================================
    // Businesses Table
    // ============================================================
    this.businessesTable = new dynamodb.Table(this, 'Businesses', {
      partitionKey: { name: 'place_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Encryption at rest using AWS-owned keys (default, but explicit is better)
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      // DESTROY for fast iteration - change to RETAIN before production!
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // GSI for searching by business_type + state
    this.businessesTable.addGlobalSecondaryIndex({
      indexName: 'by-type-state',
      partitionKey: { name: 'business_type', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'state', type: dynamodb.AttributeType.STRING },
    });

    // GSI for searching by friendly_slug (for preview app lookups)
    this.businessesTable.addGlobalSecondaryIndex({
      indexName: 'by-slug',
      partitionKey: { name: 'friendly_slug', type: dynamodb.AttributeType.STRING },
    });

    // ============================================================
    // Jobs Table
    // ============================================================
    this.jobsTable = new dynamodb.Table(this, 'Jobs', {
      partitionKey: { name: 'job_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Encryption at rest using AWS-owned keys
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'expires_at', // Auto-cleanup old jobs
      // DESTROY for fast iteration
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // GSI for querying jobs by status
    this.jobsTable.addGlobalSecondaryIndex({
      indexName: 'by-status',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING },
    });

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'BusinessesTableName', {
      value: this.businessesTable.tableName,
      exportName: `${cdk.Aws.STACK_NAME}-BusinessesTableName`,
    });

    new cdk.CfnOutput(this, 'BusinessesTableArn', {
      value: this.businessesTable.tableArn,
      exportName: `${cdk.Aws.STACK_NAME}-BusinessesTableArn`,
    });

    new cdk.CfnOutput(this, 'JobsTableName', {
      value: this.jobsTable.tableName,
      exportName: `${cdk.Aws.STACK_NAME}-JobsTableName`,
    });
  }
}
