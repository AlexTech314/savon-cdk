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

interface PrepareOutput {
  bucket: string;
  itemsS3Key: string;
  totalBusinesses: number;
  jobId: string;
}

interface Business {
  place_id: string;
  website_uri?: string;
  web_scraped?: boolean;
  [key: string]: unknown;
}

// ============ Handler ============

export async function handler(event: PrepareInput): Promise<PrepareOutput> {
  console.log('PrepareScrape input:', JSON.stringify(event, null, 2));
  
  const { jobId, filterRules = [], placeIds, forceRescrape = false } = event;
  
  if (!jobId) {
    throw new Error('jobId is required');
  }
  
  // Get businesses that need scraping
  const businessPlaceIds = await getBusinessesToScrape(placeIds, filterRules, forceRescrape);
  
  console.log(`Found ${businessPlaceIds.length} businesses to scrape`);
  
  // Write placeIds array to S3
  const itemsS3Key = `jobs/${jobId}/scrape-items.json`;
  
  await s3Client.send(new PutObjectCommand({
    Bucket: CAMPAIGN_DATA_BUCKET,
    Key: itemsS3Key,
    Body: JSON.stringify(businessPlaceIds),
    ContentType: 'application/json',
  }));
  
  console.log(`Wrote ${businessPlaceIds.length} placeIds to s3://${CAMPAIGN_DATA_BUCKET}/${itemsS3Key}`);
  
  return {
    bucket: CAMPAIGN_DATA_BUCKET,
    itemsS3Key,
    totalBusinesses: businessPlaceIds.length,
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
