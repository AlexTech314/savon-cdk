import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// ============ Google API Key Rotation with Per-Key Rate Limiting ============
const GOOGLE_API_KEYS: Record<string, string | undefined> = {
  original: process.env.GOOGLE_API_KEY_ORIGINAL,
  outreach: process.env.GOOGLE_API_KEY_OUTREACH,
  mail: process.env.GOOGLE_API_KEY_MAIL,
  presley: process.env.GOOGLE_API_KEY_PRESLEY,
};

const activeKeyNames = (process.env.GOOGLE_API_KEYS_ACTIVE || 'original')
  .split(',')
  .map(k => k.trim().toLowerCase())
  .filter(k => GOOGLE_API_KEYS[k]);

const activeKeys = activeKeyNames.map(k => GOOGLE_API_KEYS[k]!);

// Per-key rate limiting: 8 requests/second per key
const RATE_LIMIT_PER_KEY_PER_SECOND = 8;

interface KeyRateLimiter {
  name: string;
  key: string;
  tokens: number;
  lastRefill: number;
}

const keyRateLimiters: KeyRateLimiter[] = activeKeyNames.map((name, i) => ({
  name,
  key: activeKeys[i],
  tokens: RATE_LIMIT_PER_KEY_PER_SECOND,
  lastRefill: Date.now(),
}));

let lastUsedKeyIndex = -1;

function refillTokens(limiter: KeyRateLimiter): void {
  const now = Date.now();
  const elapsed = (now - limiter.lastRefill) / 1000;
  limiter.tokens = Math.min(
    RATE_LIMIT_PER_KEY_PER_SECOND,
    limiter.tokens + elapsed * RATE_LIMIT_PER_KEY_PER_SECOND
  );
  limiter.lastRefill = now;
}

async function getNextApiKey(): Promise<string> {
  if (keyRateLimiters.length === 0) {
    throw new Error('No active Google API keys configured');
  }

  return new Promise((resolve) => {
    const tryAcquire = () => {
      keyRateLimiters.forEach(refillTokens);

      for (let i = 0; i < keyRateLimiters.length; i++) {
        const index = (lastUsedKeyIndex + 1 + i) % keyRateLimiters.length;
        const limiter = keyRateLimiters[index];
        
        if (limiter.tokens >= 1) {
          limiter.tokens -= 1;
          lastUsedKeyIndex = index;
          console.log(`[Google API] Using key: ${limiter.name} (${limiter.tokens.toFixed(1)} tokens remaining)`);
          resolve(limiter.key);
          return;
        }
      }

      const soonest = keyRateLimiters.reduce((min, limiter) => {
        const waitTime = ((1 - limiter.tokens) / RATE_LIMIT_PER_KEY_PER_SECOND) * 1000;
        return waitTime < min ? waitTime : min;
      }, Infinity);

      console.log(`[Google API] All keys exhausted, waiting ${Math.ceil(soonest)}ms...`);
      setTimeout(tryAcquire, Math.max(10, soonest));
    };

    tryAcquire();
  });
}

console.log(`Google API Keys: ${activeKeyNames.length} active (${activeKeyNames.join(', ')})`);
console.log(`Per-key rate limit: ${RATE_LIMIT_PER_KEY_PER_SECOND} req/sec × ${activeKeyNames.length} keys = ${RATE_LIMIT_PER_KEY_PER_SECOND * activeKeyNames.length} req/sec total`);

const BUSINESSES_TABLE_NAME = process.env.BUSINESSES_TABLE_NAME!;

// ============ Types ============

interface FilterRule {
  field: string;
  operator: 'EXISTS' | 'NOT_EXISTS' | 'EQUALS' | 'NOT_EQUALS';
  value?: string;
}

interface JobInput {
  // Task flags
  runSearch?: boolean;
  runDetails?: boolean;
  runEnrich?: boolean;
  runPhotos?: boolean;
  runCopy?: boolean;
  
  // Input data
  placeIds?: string[];
  
  // Options
  concurrency?: number;
  skipIfDone?: boolean;
  maxPhotosPerBusiness?: number;
  
  // Filter rules
  filterRules?: FilterRule[];
}

// ============ Filter Rule Helpers ============

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

interface Business {
  place_id: string;
  business_name: string;
  details_fetched?: boolean;
  photos_fetched?: boolean;
  has_website?: boolean;
  [key: string]: unknown;
}

interface PlacePhotos {
  photos?: Array<{
    name: string;
    widthPx?: number;
    heightPx?: number;
    authorAttributions?: Array<{
      displayName?: string;
      uri?: string;
      photoUri?: string;
    }>;
  }>;
}

// ============ API Functions ============

/**
 * Get photo references with full metadata using Place Details API ($7/1000 for photos)
 */
async function getPlacePhotos(placeId: string): Promise<PlacePhotos> {
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  
  // Request photos with all available metadata
  const fieldMask = 'photos.name,photos.widthPx,photos.heightPx,photos.authorAttributions';

  // Get next available key (waits if rate limited)
  const apiKey = await getNextApiKey();

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
  });

  if (!response.ok) {
    throw new Error(`Places API photos failed: ${response.status} - ${await response.text()}`);
  }

  return await response.json() as PlacePhotos;
}

// ============ Helper Functions ============

/**
 * Build a photo URL from photo reference
 * Uses round-robin key selection (sync version) to distribute load when photos are viewed
 */
let photoUrlKeyIndex = 0;
function buildPhotoUrl(photoName: string, maxWidth = 800): string {
  const key = activeKeys[photoUrlKeyIndex % activeKeys.length];
  const keyName = activeKeyNames[photoUrlKeyIndex % activeKeyNames.length];
  photoUrlKeyIndex++;
  console.log(`[Photo URL] Using key: ${keyName}`);
  return `https://places.googleapis.com/v1/${photoName}/media?key=${key}&maxWidthPx=${maxWidth}`;
}

/**
 * Get businesses that need photos fetched
 */
async function getBusinessesNeedingPhotos(
  placeIds?: string[], 
  filterRules: FilterRule[] = []
): Promise<Business[]> {
  const businesses: Business[] = [];
  let lastKey: Record<string, unknown> | undefined;

  // Build base filter expression
  let baseExpression = '(attribute_not_exists(photos_fetched) OR photos_fetched = :false) AND details_fetched = :true';
  const baseValues: Record<string, unknown> = { ':false': false, ':true': true };

  // Build filter with rules
  const { expression, names, values } = buildFilterFromRules(
    filterRules,
    placeIds ? '' : baseExpression,
    {},
    placeIds ? {} : baseValues
  );

  do {
    const command = new ScanCommand({
      TableName: BUSINESSES_TABLE_NAME,
      FilterExpression: expression || undefined,
      ExpressionAttributeNames: Object.keys(names).length > 0 ? names : undefined,
      ExpressionAttributeValues: Object.keys(values).length > 0 ? values : undefined,
      ExclusiveStartKey: lastKey,
    });

    const result = await docClient.send(command);
    const items = (result.Items || []) as Business[];
    
    if (placeIds) {
      // Apply base conditions manually for specific IDs
      businesses.push(...items.filter(b => 
        placeIds.includes(b.place_id) && 
        (!b.photos_fetched) && 
        b.details_fetched
      ));
    } else {
      businesses.push(...items);
    }
    
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return businesses;
}

/**
 * Update business with photo URLs and metadata
 */
async function updateBusinessWithPhotos(placeId: string, photos: PlacePhotos, maxPhotos: number): Promise<number> {
  const photoData = (photos.photos || [])
    .slice(0, maxPhotos)
    .map(photo => ({
      url: buildPhotoUrl(photo.name),
      name: photo.name,
      width: photo.widthPx || null,
      height: photo.heightPx || null,
      attributions: photo.authorAttributions?.map(a => ({
        displayName: a.displayName || null,
        uri: a.uri || null,
        photoUri: a.photoUri || null,
      })) || [],
    }));

  // Keep simple URL array for backwards compatibility
  const photoUrls = photoData.map(p => p.url);

  const updateFields: Record<string, unknown> = {
    photo_urls: JSON.stringify(photoUrls),
    photos_data: JSON.stringify(photoData),  // Full metadata
    photo_count: photoData.length,
    
    // Pipeline status flags
    photos_fetched: true,
    pipeline_status: 'photos', // Denormalized for GSI
    photos_fetched_at: new Date().toISOString(),
  };

  // Build update expression
  const updateParts: string[] = [];
  const expressionNames: Record<string, string> = {};
  const expressionValues: Record<string, unknown> = {};

  Object.entries(updateFields).forEach(([key, value], index) => {
    updateParts.push(`#attr${index} = :val${index}`);
    expressionNames[`#attr${index}`] = key;
    expressionValues[`:val${index}`] = value;
  });

  await docClient.send(new UpdateCommand({
    TableName: BUSINESSES_TABLE_NAME,
    Key: { place_id: placeId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
  }));

  return photoUrls.length;
}

// ============ Main ============

async function main(): Promise<void> {
  console.log('=== Photos Task ($7/1000) ===');
  console.log(`Table: ${BUSINESSES_TABLE_NAME}`);

  // Parse job input from environment
  const jobInputStr = process.env.JOB_INPUT;
  let jobInput: JobInput = {};
  
  if (jobInputStr) {
    try {
      jobInput = JSON.parse(jobInputStr);
    } catch (e) {
      console.warn('Could not parse JOB_INPUT, using defaults');
    }
  }

  const placeIds = jobInput.placeIds;
  const concurrency = jobInput.concurrency || 5;
  const skipIfDone = jobInput.skipIfDone !== false; // Default true
  const maxPhotosPerBusiness = jobInput.maxPhotosPerBusiness || 5;
  const filterRules = jobInput.filterRules || [];

  console.log(`Concurrency: ${concurrency}`);
  console.log(`Specific place IDs: ${placeIds ? placeIds.length : 'all needing photos'}`);
  console.log(`Skip if already done: ${skipIfDone}`);
  console.log(`Max photos per business: ${maxPhotosPerBusiness}`);
  console.log(`Filter rules: ${filterRules.length > 0 ? JSON.stringify(filterRules) : 'none'}`);

  // Get businesses that need photos
  let businesses = await getBusinessesNeedingPhotos(placeIds, filterRules);
  
  // If skipIfDone is true and we have specific placeIds, filter out already-done ones
  if (skipIfDone && placeIds) {
    businesses = businesses.filter(b => !b.photos_fetched);
  }
  
  console.log(`Found ${businesses.length} businesses needing photos`);

  if (businesses.length === 0) {
    console.log('No businesses need photos. Exiting.');
    return;
  }

  // Process with limited concurrency
  let processed = 0;
  let failed = 0;
  let totalPhotos = 0;

  for (let i = 0; i < businesses.length; i += concurrency) {
    const batch = businesses.slice(i, i + concurrency);
    
    await Promise.all(batch.map(async (business) => {
      try {
        console.log(`\nFetching photos for: ${business.business_name} (${business.place_id})`);
        
        const photos = await getPlacePhotos(business.place_id);
        const photoCount = await updateBusinessWithPhotos(business.place_id, photos, maxPhotosPerBusiness);
        
        processed++;
        totalPhotos += photoCount;
        console.log(`  ✓ Updated with ${photoCount} photos`);
      } catch (error) {
        failed++;
        console.error(`  ✗ Failed for ${business.business_name}:`, error);
      }
    }));

    console.log(`Progress: ${processed + failed}/${businesses.length}`);
  }

  console.log('\n=== Photos Task Complete ===');
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total photos: ${totalPhotos}`);
}

main().catch(error => {
  console.error('Task failed:', error);
  process.exit(1);
});
