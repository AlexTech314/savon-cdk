/**
 * Backfill Migration Script
 * 
 * Adds denormalized GSI fields to existing records:
 * - pipeline_status: 'searched' | 'details' | 'reviews' | 'photos' | 'complete'
 * - has_website_str: 'true' | 'false'
 * 
 * Usage:
 *   cd scripts
 *   npm install
 *   npx ts-node backfill-gsi-fields.ts
 * 
 * Or for dry run (no writes):
 *   DRY_RUN=true npx ts-node backfill-gsi-fields.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  UpdateCommand 
} from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = 'Alpha-Stateful-BusinessesD76A4163-12N881B498O0A';
const DRY_RUN = process.env.DRY_RUN === 'true';

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

interface BusinessRecord {
  place_id: string;
  searched?: boolean;
  details_fetched?: boolean;
  reviews_fetched?: boolean;
  photos_fetched?: boolean;
  copy_generated?: boolean;
  has_website?: boolean;
  pipeline_status?: string;
  has_website_str?: string;
}

/**
 * Determine pipeline_status based on boolean flags
 */
function computePipelineStatus(record: BusinessRecord): string {
  if (record.copy_generated) return 'complete';
  if (record.photos_fetched) return 'photos';
  if (record.reviews_fetched) return 'reviews';
  if (record.details_fetched) return 'details';
  if (record.searched) return 'searched';
  return 'searched'; // Default
}

/**
 * Determine has_website_str
 */
function computeHasWebsiteStr(record: BusinessRecord): string | undefined {
  // Only set if details have been fetched (otherwise we don't know)
  if (record.details_fetched) {
    return record.has_website ? 'true' : 'false';
  }
  return undefined;
}

async function scanAllRecords(): Promise<BusinessRecord[]> {
  const records: BusinessRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;

  console.log('Scanning table...');
  
  do {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: lastKey,
    });

    const result = await docClient.send(command);
    records.push(...(result.Items as BusinessRecord[] || []));
    lastKey = result.LastEvaluatedKey;
    
    process.stdout.write(`\r  Scanned ${records.length} records...`);
  } while (lastKey);

  console.log(`\n  Total: ${records.length} records`);
  return records;
}

async function updateRecord(record: BusinessRecord, updates: Record<string, string>): Promise<void> {
  const updateParts: string[] = [];
  const expressionNames: Record<string, string> = {};
  const expressionValues: Record<string, unknown> = {};

  Object.entries(updates).forEach(([key, value], index) => {
    updateParts.push(`#attr${index} = :val${index}`);
    expressionNames[`#attr${index}`] = key;
    expressionValues[`:val${index}`] = value;
  });

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { place_id: record.place_id },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
  });

  await docClient.send(command);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Backfill GSI Fields Migration');
  console.log('='.repeat(60));
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log('');

  const records = await scanAllRecords();

  let needsUpdate = 0;
  let alreadyComplete = 0;
  let updated = 0;
  let errors = 0;

  console.log('\nAnalyzing records...');

  const toUpdate: { record: BusinessRecord; updates: Record<string, string> }[] = [];

  for (const record of records) {
    const updates: Record<string, string> = {};

    // Check if pipeline_status needs to be set
    const computedStatus = computePipelineStatus(record);
    if (record.pipeline_status !== computedStatus) {
      updates.pipeline_status = computedStatus;
    }

    // Check if has_website_str needs to be set
    const computedHasWebsite = computeHasWebsiteStr(record);
    if (computedHasWebsite !== undefined && record.has_website_str !== computedHasWebsite) {
      updates.has_website_str = computedHasWebsite;
    }

    if (Object.keys(updates).length > 0) {
      needsUpdate++;
      toUpdate.push({ record, updates });
    } else {
      alreadyComplete++;
    }
  }

  console.log(`  Needs update: ${needsUpdate}`);
  console.log(`  Already up-to-date: ${alreadyComplete}`);
  console.log('');

  if (needsUpdate === 0) {
    console.log('No records need updating. Done!');
    return;
  }

  if (DRY_RUN) {
    console.log('DRY RUN - Showing first 10 updates that would be made:');
    for (const { record, updates } of toUpdate.slice(0, 10)) {
      console.log(`  ${record.place_id}: ${JSON.stringify(updates)}`);
    }
    if (toUpdate.length > 10) {
      console.log(`  ... and ${toUpdate.length - 10} more`);
    }
    console.log('\nRun without DRY_RUN=true to apply updates.');
    return;
  }

  console.log('Updating records...');
  const startTime = Date.now();

  for (let i = 0; i < toUpdate.length; i++) {
    const { record, updates } = toUpdate[i];
    
    try {
      await updateRecord(record, updates);
      updated++;
    } catch (error) {
      errors++;
      console.error(`\n  Error updating ${record.place_id}:`, error);
    }

    if ((i + 1) % 100 === 0 || i === toUpdate.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (updated / parseFloat(elapsed)).toFixed(1);
      process.stdout.write(`\r  Updated ${updated}/${needsUpdate} (${rate}/sec, ${errors} errors)`);
    }

    // Rate limiting: ~25 writes/sec to stay under provisioned capacity
    if ((i + 1) % 25 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n');
  console.log('='.repeat(60));
  console.log('Migration Complete');
  console.log('='.repeat(60));
  console.log(`  Updated: ${updated}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Time: ${totalTime}s`);
}

main().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
