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
  skipWithWebsite?: boolean; // Skip businesses that have a website
}

interface Business {
  place_id: string;
  business_name: string;
  details_fetched?: boolean;
  reviews_fetched?: boolean;
  has_website?: boolean;
  [key: string]: unknown;
}

interface PlaceEnrichment {
  reviews?: Array<{
    text?: { text: string };
    rating?: number;
    authorAttribution?: { displayName?: string; uri?: string };
    relativePublishTimeDescription?: string;
  }>;
  editorialSummary?: { text: string };
}

// ============ API Functions ============

/**
 * Get reviews and editorial summary using Place Details API (Enterprise+Atmosphere tier: $25/1000)
 * Only requests: reviews, editorialSummary
 */
async function getPlaceEnrichment(placeId: string): Promise<PlaceEnrichment> {
  await rateLimiter.acquire();
  
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  
  // Enterprise+Atmosphere tier fields
  const fieldMask = 'reviews,editorialSummary';

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': fieldMask,
    },
  });

  if (!response.ok) {
    throw new Error(`Places API enrichment failed: ${response.status} - ${await response.text()}`);
  }

  return await response.json() as PlaceEnrichment;
}

// ============ Helper Functions ============

function formatAuthorDisplayName(fullName: string): string {
  if (!fullName) return 'Anonymous';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

/**
 * Get businesses that need reviews fetched
 */
async function getBusinessesNeedingEnrichment(placeIds?: string[], skipWithWebsite = true): Promise<Business[]> {
  const businesses: Business[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    // Build filter expression
    let filterExpression = '(attribute_not_exists(reviews_fetched) OR reviews_fetched = :false) AND details_fetched = :true';
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
 * Update business with reviews and editorial summary
 */
async function updateBusinessWithEnrichment(placeId: string, enrichment: PlaceEnrichment): Promise<void> {
  // Transform reviews to a cleaner format
  const reviews = (enrichment.reviews || [])
    .slice(0, 5) // Keep top 5 reviews
    .filter(r => r.text?.text)
    .map(r => ({
      text: r.text?.text || '',
      authorName: r.authorAttribution?.displayName || 'Anonymous',
      authorDisplayName: formatAuthorDisplayName(r.authorAttribution?.displayName || ''),
      authorUri: r.authorAttribution?.uri || '',
      rating: r.rating,
      relativeTime: r.relativePublishTimeDescription,
    }));

  const updateFields: Record<string, unknown> = {
    reviews: JSON.stringify(reviews),
    editorial_summary: enrichment.editorialSummary?.text || '',
    review_count: reviews.length,
    
    // Pipeline status flags
    reviews_fetched: true,
    reviews_fetched_at: new Date().toISOString(),
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
}

// ============ Main ============

async function main(): Promise<void> {
  console.log('=== Enrich Task (Enterprise+Atmosphere Tier: $25/1000) ===');
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
  const skipWithWebsite = jobInput.skipWithWebsite !== false; // Default true

  console.log(`Concurrency: ${concurrency}`);
  console.log(`Specific place IDs: ${placeIds ? placeIds.length : 'all needing enrichment'}`);
  console.log(`Skip if already done: ${skipIfDone}`);
  console.log(`Skip with website: ${skipWithWebsite}`);

  // Get businesses that need enrichment
  let businesses = await getBusinessesNeedingEnrichment(placeIds, skipWithWebsite);
  
  // If skipIfDone is true and we have specific placeIds, filter out already-done ones
  if (skipIfDone && placeIds) {
    businesses = businesses.filter(b => !b.reviews_fetched);
  }
  
  console.log(`Found ${businesses.length} businesses needing enrichment`);

  if (businesses.length === 0) {
    console.log('No businesses need enrichment. Exiting.');
    return;
  }

  // Process with limited concurrency
  let processed = 0;
  let failed = 0;
  let withReviews = 0;
  let withoutReviews = 0;

  for (let i = 0; i < businesses.length; i += concurrency) {
    const batch = businesses.slice(i, i + concurrency);
    
    await Promise.all(batch.map(async (business) => {
      try {
        console.log(`\nFetching reviews for: ${business.business_name} (${business.place_id})`);
        
        const enrichment = await getPlaceEnrichment(business.place_id);
        await updateBusinessWithEnrichment(business.place_id, enrichment);
        
        processed++;
        const reviewCount = enrichment.reviews?.length || 0;
        if (reviewCount > 0) {
          withReviews++;
          console.log(`  ✓ Updated with ${reviewCount} reviews`);
        } else {
          withoutReviews++;
          console.log(`  ✓ Updated (no reviews available)`);
        }
      } catch (error) {
        failed++;
        console.error(`  ✗ Failed for ${business.business_name}:`, error);
      }
    }));

    console.log(`Progress: ${processed + failed}/${businesses.length}`);
  }

  console.log('\n=== Enrich Task Complete ===');
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`With reviews: ${withReviews}`);
  console.log(`Without reviews: ${withoutReviews}`);
  console.log('Next step: Run copy-task to generate LLM copy');
}

main().catch(error => {
  console.error('Task failed:', error);
  process.exit(1);
});
