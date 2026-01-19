/**
 * Backfill Jobs _pk Field Migration
 * 
 * Adds the _pk = 'JOB' field to existing job records to enable
 * the by-date GSI for efficient date-sorted pagination.
 * 
 * Usage:
 *   cd scripts
 *   npm install
 *   npx ts-node backfill-jobs-pk.ts
 * 
 * Or for dry run (no writes):
 *   DRY_RUN=true npx ts-node backfill-jobs-pk.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  UpdateCommand 
} from '@aws-sdk/lib-dynamodb';

// Get table name from environment or use default
const TABLE_NAME = process.env.JOBS_TABLE_NAME || 'Alpha-Stateful-JobsDF1CC2D4-4NU1QL5NFYTU';
const DRY_RUN = process.env.DRY_RUN === 'true';

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

interface JobRecord {
  job_id: string;
  created_at: string;
  _pk?: string;
}

async function scanAllRecords(): Promise<JobRecord[]> {
  const records: JobRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;

  console.log('Scanning table...');
  
  do {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: lastKey,
    });

    const result = await docClient.send(command);
    records.push(...(result.Items as JobRecord[] || []));
    lastKey = result.LastEvaluatedKey;
    
    process.stdout.write(`\r  Scanned ${records.length} records...`);
  } while (lastKey);

  console.log(`\n  Total: ${records.length} records`);
  return records;
}

async function updateRecord(record: JobRecord): Promise<void> {
  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { 
      job_id: record.job_id,
      created_at: record.created_at,
    },
    UpdateExpression: 'SET #pk = :pk',
    ExpressionAttributeNames: { '#pk': '_pk' },
    ExpressionAttributeValues: { ':pk': 'JOB' },
  });

  await docClient.send(command);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Backfill Jobs _pk Field Migration');
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

  const toUpdate: JobRecord[] = [];

  for (const record of records) {
    if (record._pk !== 'JOB') {
      needsUpdate++;
      toUpdate.push(record);
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
    console.log('DRY RUN - Showing first 10 jobs that would be updated:');
    for (const record of toUpdate.slice(0, 10)) {
      console.log(`  ${record.job_id} (created: ${record.created_at})`);
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
    const record = toUpdate[i];
    
    try {
      await updateRecord(record);
      updated++;
    } catch (error) {
      errors++;
      console.error(`\n  Error updating ${record.job_id}:`, error);
    }

    if ((i + 1) % 10 === 0 || i === toUpdate.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = updated > 0 ? (updated / parseFloat(elapsed)).toFixed(1) : '0';
      process.stdout.write(`\r  Updated ${updated}/${needsUpdate} (${rate}/sec, ${errors} errors)`);
    }

    // Rate limiting: ~25 writes/sec to stay under on-demand capacity
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
