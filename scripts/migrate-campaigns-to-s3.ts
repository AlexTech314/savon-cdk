/**
 * Migration Script: Move campaign searches from DynamoDB to S3
 * 
 * This script migrates existing campaigns that have inline `searches` arrays
 * in DynamoDB to the new S3-based storage.
 * 
 * Prerequisites:
 * 1. Deploy the infrastructure update (creates S3 bucket)
 * 2. Have AWS credentials configured locally
 * 
 * Usage:
 *   CAMPAIGNS_TABLE=<table-name> BUCKET_NAME=<bucket-name> npx ts-node scripts/migrate-campaigns-to-s3.ts
 * 
 * Or with defaults:
 *   npx ts-node scripts/migrate-campaigns-to-s3.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

// Configuration - can be overridden via environment variables
const CAMPAIGNS_TABLE = process.env.CAMPAIGNS_TABLE || 'Alpha-Stateful-CampaignsEB561EE0-1HP41Q9LML5Z5';
const BUCKET_NAME = process.env.BUCKET_NAME;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!BUCKET_NAME) {
  console.error('ERROR: BUCKET_NAME environment variable is required.');
  console.error('Get the bucket name from CDK output: CampaignDataBucketName');
  console.error('');
  console.error('Usage:');
  console.error('  BUCKET_NAME=<bucket-name> npx ts-node scripts/migrate-campaigns-to-s3.ts');
  process.exit(1);
}

const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const s3Client = new S3Client({ region: AWS_REGION });

interface SearchQuery {
  textQuery: string;
  includedType?: string;
}

interface OldCampaign {
  campaign_id: string;
  name: string;
  description?: string;
  searches?: SearchQuery[];  // Old format - inline array
  searches_s3_key?: string;  // New format - S3 key
  searches_count?: number;   // New format - count
  max_results_per_search: number;
  only_without_website: boolean;
  data_tier?: string;
  created_at: string;
  updated_at: string;
  last_run_at?: string;
}

function getSearchesS3Key(campaignId: string): string {
  return `campaigns/${campaignId}/searches.json`;
}

async function checkS3ObjectExists(key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }));
    return true;
  } catch {
    return false;
  }
}

async function uploadSearchesToS3(campaignId: string, searches: SearchQuery[]): Promise<string> {
  const s3Key = getSearchesS3Key(campaignId);
  
  const content = JSON.stringify({
    searches,
    count: searches.length,
    migratedAt: new Date().toISOString(),
  }, null, 2);
  
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: content,
    ContentType: 'application/json',
  }));
  
  return s3Key;
}

async function updateCampaignInDynamo(
  campaignId: string, 
  s3Key: string, 
  searchesCount: number
): Promise<void> {
  // Update campaign: add searches_s3_key and searches_count, remove searches
  await docClient.send(new UpdateCommand({
    TableName: CAMPAIGNS_TABLE,
    Key: { campaign_id: campaignId },
    UpdateExpression: 'SET #s3key = :s3key, #count = :count, #updated = :updated REMOVE #searches',
    ExpressionAttributeNames: {
      '#s3key': 'searches_s3_key',
      '#count': 'searches_count',
      '#updated': 'updated_at',
      '#searches': 'searches',
    },
    ExpressionAttributeValues: {
      ':s3key': s3Key,
      ':count': searchesCount,
      ':updated': new Date().toISOString(),
    },
  }));
}

async function migrateCampaign(campaign: OldCampaign): Promise<'migrated' | 'skipped' | 'error'> {
  const { campaign_id, name, searches, searches_s3_key } = campaign;
  
  // Skip if already migrated
  if (searches_s3_key) {
    console.log(`  ⏭️  Already migrated (has searches_s3_key)`);
    return 'skipped';
  }
  
  // Skip if no searches to migrate
  if (!searches || searches.length === 0) {
    console.log(`  ⏭️  No searches to migrate`);
    return 'skipped';
  }
  
  console.log(`  📦 ${searches.length} searches to migrate`);
  
  if (DRY_RUN) {
    console.log(`  🏃 [DRY RUN] Would upload to S3 and update DynamoDB`);
    return 'migrated';
  }
  
  try {
    // Check if S3 object already exists (in case of partial migration)
    const s3Key = getSearchesS3Key(campaign_id);
    const exists = await checkS3ObjectExists(s3Key);
    
    if (exists) {
      console.log(`  ⚠️  S3 object already exists, updating DynamoDB only`);
    } else {
      // Upload searches to S3
      console.log(`  ⬆️  Uploading to S3: ${s3Key}`);
      await uploadSearchesToS3(campaign_id, searches);
    }
    
    // Update DynamoDB
    console.log(`  📝 Updating DynamoDB record`);
    await updateCampaignInDynamo(campaign_id, s3Key, searches.length);
    
    console.log(`  ✅ Migrated successfully`);
    return 'migrated';
  } catch (error) {
    console.error(`  ❌ Error:`, error);
    return 'error';
  }
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Campaign Migration: DynamoDB → S3');
  console.log('='.repeat(60));
  console.log('');
  console.log(`Configuration:`);
  console.log(`  Table:  ${CAMPAIGNS_TABLE}`);
  console.log(`  Bucket: ${BUCKET_NAME}`);
  console.log(`  Region: ${AWS_REGION}`);
  console.log(`  Mode:   ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('');
  
  // Scan all campaigns
  console.log('Scanning campaigns table...');
  const allCampaigns: OldCampaign[] = [];
  let lastKey: Record<string, unknown> | undefined;
  
  do {
    const result = await docClient.send(new ScanCommand({
      TableName: CAMPAIGNS_TABLE,
      ExclusiveStartKey: lastKey,
    }));
    
    allCampaigns.push(...(result.Items || []) as OldCampaign[]);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  console.log(`Found ${allCampaigns.length} campaigns`);
  console.log('');
  
  // Process each campaign
  const stats = { migrated: 0, skipped: 0, error: 0 };
  
  for (let i = 0; i < allCampaigns.length; i++) {
    const campaign = allCampaigns[i];
    console.log(`[${i + 1}/${allCampaigns.length}] ${campaign.name} (${campaign.campaign_id})`);
    
    const result = await migrateCampaign(campaign);
    stats[result]++;
  }
  
  // Summary
  console.log('');
  console.log('='.repeat(60));
  console.log('Migration Complete');
  console.log('='.repeat(60));
  console.log(`  Migrated: ${stats.migrated}`);
  console.log(`  Skipped:  ${stats.skipped}`);
  console.log(`  Errors:   ${stats.error}`);
  
  if (DRY_RUN) {
    console.log('');
    console.log('This was a DRY RUN. No changes were made.');
    console.log('Run without DRY_RUN=true to apply changes.');
  }
  
  if (stats.error > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
