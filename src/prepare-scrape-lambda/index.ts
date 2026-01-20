import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const s3Client = new S3Client({});

const BUSINESSES_TABLE_NAME = process.env.BUSINESSES_TABLE_NAME!;
const CAMPAIGN_DATA_BUCKET = process.env.CAMPAIGN_DATA_BUCKET!;

// ============ Types ============

interface FilterRule {
  field: string;
  operator: 'EXISTS' | 'NOT_EXISTS' | 'EQUALS' | 'NOT_EQUALS';
  value?: string;
}

interface PrepareInput {
  jobId: string;
  filterRules?: FilterRule[];
  placeIds?: string[];
  forceRescrape?: boolean;
}

interface BatchReference {
  batchS3Key: string;
  batchIndex: number;
  itemCount: number;
  jobId: string;
}

interface PrepareOutput {
  bucket: string;
  manifestS3Key: string;
  totalBusinesses: number;
  totalBatches: number;
  jobId: string;
}

interface Business {
  place_id: string;
  website_uri?: string;
  web_scraped?: boolean;
  [key: string]: unknown;
}

// ============ Handler ============

// Batch size - 250 items per batch keeps payloads small while minimizing ECS task count
const BATCH_SIZE = 250;

export async function handler(event: PrepareInput): Promise<PrepareOutput> {
  console.log('PrepareScrape input:', JSON.stringify(event, null, 2));
  
  const { jobId, filterRules = [], placeIds, forceRescrape = false } = event;
  
  if (!jobId) {
    throw new Error('jobId is required');
  }
  
  // Get businesses that need scraping
  const businessPlaceIds = await getBusinessesToScrape(placeIds, filterRules, forceRescrape);
  
  console.log(`Found ${businessPlaceIds.length} businesses to scrape`);
  
  if (businessPlaceIds.length === 0) {
    // Write empty manifest
    const manifestS3Key = `jobs/${jobId}/batch-manifest.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: CAMPAIGN_DATA_BUCKET,
      Key: manifestS3Key,
      Body: JSON.stringify([]),
      ContentType: 'application/json',
    }));
    
    return {
      bucket: CAMPAIGN_DATA_BUCKET,
      manifestS3Key,
      totalBusinesses: 0,
      totalBatches: 0,
      jobId,
    };
  }
  
  // Split into batches and write each batch to S3
  const batchReferences: BatchReference[] = [];
  const totalBatches = Math.ceil(businessPlaceIds.length / BATCH_SIZE);
  
  console.log(`Splitting into ${totalBatches} batches of up to ${BATCH_SIZE} items each`);
  
  // Write batch files in parallel (with concurrency limit)
  const WRITE_CONCURRENCY = 10;
  for (let i = 0; i < totalBatches; i += WRITE_CONCURRENCY) {
    const batchPromises = [];
    
    for (let j = i; j < Math.min(i + WRITE_CONCURRENCY, totalBatches); j++) {
      const startIdx = j * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, businessPlaceIds.length);
      const batchItems = businessPlaceIds.slice(startIdx, endIdx);
      
      const batchS3Key = `jobs/${jobId}/batches/batch-${String(j).padStart(4, '0')}.json`;
      
      batchPromises.push(
        s3Client.send(new PutObjectCommand({
          Bucket: CAMPAIGN_DATA_BUCKET,
          Key: batchS3Key,
          Body: JSON.stringify(batchItems),
          ContentType: 'application/json',
        })).then(() => {
          batchReferences.push({
            batchS3Key,
            batchIndex: j,
            itemCount: batchItems.length,
            jobId,
          });
        })
      );
    }
    
    await Promise.all(batchPromises);
  }
  
  // Sort batch references by index (since parallel writes may complete out of order)
  batchReferences.sort((a, b) => a.batchIndex - b.batchIndex);
  
  // Write manifest file with all batch references
  const manifestS3Key = `jobs/${jobId}/batch-manifest.json`;
  await s3Client.send(new PutObjectCommand({
    Bucket: CAMPAIGN_DATA_BUCKET,
    Key: manifestS3Key,
    Body: JSON.stringify(batchReferences),
    ContentType: 'application/json',
  }));
  
  console.log(`Wrote ${totalBatches} batch files and manifest to s3://${CAMPAIGN_DATA_BUCKET}/${manifestS3Key}`);
  
  return {
    bucket: CAMPAIGN_DATA_BUCKET,
    manifestS3Key,
    totalBusinesses: businessPlaceIds.length,
    totalBatches,
    jobId,
  };
}

// ============ DynamoDB Query ============

/**
 * Build a DynamoDB filter expression from filter rules
 */
function buildFilterFromRules(
  rules: FilterRule[],
  baseExpression: string,
  existingNames: Record<string, string> = {},
  existingValues: Record<string, unknown> = {}
): {
  expression: string;
  names: Record<string, string>;
  values: Record<string, unknown>;
} {
  const names = { ...existingNames };
  const values = { ...existingValues };
  const conditions: string[] = baseExpression ? [baseExpression] : [];
  
  rules.forEach((rule, index) => {
    const fieldAlias = `#filterField${index}`;
    const valueAlias = `:filterVal${index}`;
    names[fieldAlias] = rule.field;
    
    switch (rule.operator) {
      case 'EXISTS':
        conditions.push(`attribute_exists(${fieldAlias})`);
        break;
      case 'NOT_EXISTS':
        conditions.push(`attribute_not_exists(${fieldAlias})`);
        break;
      case 'EQUALS':
        values[valueAlias] = rule.value;
        conditions.push(`${fieldAlias} = ${valueAlias}`);
        break;
      case 'NOT_EQUALS':
        values[valueAlias] = rule.value;
        conditions.push(`${fieldAlias} <> ${valueAlias}`);
        break;
    }
  });
  
  return {
    expression: conditions.join(' AND '),
    names,
    values,
  };
}

/**
 * Get businesses that need to be scraped based on filters.
 * Returns just the placeIds (not full business objects) for efficiency.
 */
async function getBusinessesToScrape(
  placeIds?: string[],
  filterRules: FilterRule[] = [],
  forceRescrape: boolean = false
): Promise<string[]> {
  const businessPlaceIds: string[] = [];
  let lastKey: Record<string, unknown> | undefined;
  
  // Base filter: must have website_uri
  let baseExpression = 'attribute_exists(#website)';
  const baseNames: Record<string, string> = { '#website': 'website_uri' };
  const baseValues: Record<string, unknown> = {};
  
  if (!forceRescrape) {
    baseExpression += ' AND (attribute_not_exists(#scraped) OR #scraped = :false)';
    baseNames['#scraped'] = 'web_scraped';
    baseValues[':false'] = false;
  }
  
  // Build filter with rules
  const { expression, names, values } = buildFilterFromRules(
    filterRules,
    placeIds ? '' : baseExpression,
    placeIds ? {} : baseNames,
    placeIds ? {} : baseValues
  );
  
  // Use ProjectionExpression to only fetch needed fields
  const projectionExpression = 'place_id, website_uri, web_scraped';
  
  do {
    const command = new ScanCommand({
      TableName: BUSINESSES_TABLE_NAME,
      FilterExpression: expression || undefined,
      ExpressionAttributeNames: Object.keys(names).length > 0 ? names : undefined,
      ExpressionAttributeValues: Object.keys(values).length > 0 ? values : undefined,
      ProjectionExpression: projectionExpression,
      ExclusiveStartKey: lastKey,
    });
    
    const result = await docClient.send(command);
    const items = (result.Items || []) as Business[];
    
    if (placeIds) {
      // Filter to specific IDs and apply base conditions
      const placeIdSet = new Set(placeIds);
      items.forEach(b => {
        if (!placeIdSet.has(b.place_id)) return;
        if (!b.website_uri) return;
        if (!forceRescrape && b.web_scraped) return;
        businessPlaceIds.push(b.place_id);
      });
    } else {
      items.forEach(b => businessPlaceIds.push(b.place_id));
    }
    
    lastKey = result.LastEvaluatedKey;
    
    // Log progress for large scans
    if (businessPlaceIds.length % 10000 === 0 && businessPlaceIds.length > 0) {
      console.log(`Scanned ${businessPlaceIds.length} businesses so far...`);
    }
  } while (lastKey);
  
  return businessPlaceIds;
}
