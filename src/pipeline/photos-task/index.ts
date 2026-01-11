import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!;
const BUSINESSES_TABLE_NAME = process.env.BUSINESSES_TABLE_NAME!;

// Rate limiter for Google Places API (600 requests/minute = 10/second)
const RATE_LIMIT_PER_SECOND = 8;
const rateLimiter = {
  tokens: RATE_LIMIT_PER_SECOND,
  lastRefill: Date.now(),
  
  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        
        this.tokens = Math.min(
          RATE_LIMIT_PER_SECOND,
          this.tokens + elapsed * RATE_LIMIT_PER_SECOND
        );
        this.lastRefill = now;
        
        if (this.tokens >= 1) {
          this.tokens -= 1;
          resolve();
        } else {
          const waitTime = ((1 - this.tokens) / RATE_LIMIT_PER_SECOND) * 1000;
          setTimeout(tryAcquire, waitTime);
        }
      };
      
      tryAcquire();
    });
  }
};

// ============ Types ============

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
  photos?: Array<{ name: string }>;
}

// ============ API Functions ============

/**
 * Get photo references using Place Details API ($7/1000 for photos)
 */
async function getPlacePhotos(placeId: string): Promise<PlacePhotos> {
  await rateLimiter.acquire();
  
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  
  // Only request photos field
  const fieldMask = 'photos';

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
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
 */
function buildPhotoUrl(photoName: string, maxWidth = 800): string {
  return `https://places.googleapis.com/v1/${photoName}/media?key=${GOOGLE_API_KEY}&maxWidthPx=${maxWidth}`;
}

/**
 * Get businesses that need photos fetched
 */
async function getBusinessesNeedingPhotos(placeIds?: string[], skipWithWebsite = true): Promise<Business[]> {
  const businesses: Business[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    // Build filter expression
    let filterExpression = '(attribute_not_exists(photos_fetched) OR photos_fetched = :false) AND details_fetched = :true';
    const expressionValues: Record<string, unknown> = { ':false': false, ':true': true };
    
    if (skipWithWebsite) {
      filterExpression += ' AND (attribute_not_exists(has_website) OR has_website = :false)';
    }

    const command = new ScanCommand({
      TableName: BUSINESSES_TABLE_NAME,
      FilterExpression: placeIds ? undefined : filterExpression,
      ExpressionAttributeValues: placeIds ? undefined : expressionValues,
      ExclusiveStartKey: lastKey,
    });

    const result = await docClient.send(command);
    const items = (result.Items || []) as Business[];
    
    if (placeIds) {
      businesses.push(...items.filter(b => placeIds.includes(b.place_id)));
    } else {
      businesses.push(...items);
    }
    
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return businesses;
}

/**
 * Update business with photo URLs
 */
async function updateBusinessWithPhotos(placeId: string, photos: PlacePhotos, maxPhotos: number): Promise<number> {
  const photoUrls = (photos.photos || [])
    .slice(0, maxPhotos)
    .map(photo => buildPhotoUrl(photo.name));

  const updateFields: Record<string, unknown> = {
    photo_urls: JSON.stringify(photoUrls),
    photo_count: photoUrls.length,
    
    // Pipeline status flags
    photos_fetched: true,
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

  console.log(`Concurrency: ${concurrency}`);
  console.log(`Specific place IDs: ${placeIds ? placeIds.length : 'all needing photos'}`);
  console.log(`Skip if already done: ${skipIfDone}`);
  console.log(`Max photos per business: ${maxPhotosPerBusiness}`);

  // Get businesses that need photos
  let businesses = await getBusinessesNeedingPhotos(placeIds);
  
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
