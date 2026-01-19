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
const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME;

// ============ Types ============

interface FilterRule {
  field: string;
  operator: 'EXISTS' | 'NOT_EXISTS' | 'EQUALS' | 'NOT_EQUALS';
  value?: string;
}

interface JobInput {
  // Job ID for metrics tracking
  jobId?: string;
  
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
  reviews_fetched?: boolean;
  has_website?: boolean;
  [key: string]: unknown;
}

interface PlaceEnrichment {
  // Reviews
  reviews?: Array<{
    text?: { text: string };
    rating?: number;
    authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
    relativePublishTimeDescription?: string;
    publishTime?: string;
    originalText?: { text: string };
  }>;
  editorialSummary?: { text: string };
  
  // Atmosphere fields
  allowsDogs?: boolean;
  goodForChildren?: boolean;
  goodForGroups?: boolean;
  goodForWatchingSports?: boolean;
  liveMusic?: boolean;
  menuForChildren?: boolean;
  outdoorSeating?: boolean;
  reservable?: boolean;
  restroom?: boolean;
  servesBeer?: boolean;
  servesBreakfast?: boolean;
  servesBrunch?: boolean;
  servesCocktails?: boolean;
  servesCoffee?: boolean;
  servesDessert?: boolean;
  servesDinner?: boolean;
  servesLunch?: boolean;
  servesVegetarianFood?: boolean;
  servesWine?: boolean;
  
  // Service options
  curbsidePickup?: boolean;
  delivery?: boolean;
  dineIn?: boolean;
  takeout?: boolean;
  
  // Additional
  parkingOptions?: {
    freeParkingLot?: boolean;
    paidParkingLot?: boolean;
    freeStreetParking?: boolean;
    paidStreetParking?: boolean;
    valetParking?: boolean;
    freeGarageParking?: boolean;
    paidGarageParking?: boolean;
  };
  paymentOptions?: {
    acceptsCreditCards?: boolean;
    acceptsDebitCards?: boolean;
    acceptsCashOnly?: boolean;
    acceptsNfc?: boolean;
  };
  accessibilityOptions?: {
    wheelchairAccessibleParking?: boolean;
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
  };
}

// ============ API Functions ============

/**
 * Get reviews, editorial summary, and all atmosphere data using Place Details API
 * Enterprise+Atmosphere tier: $25/1000 - maximize data capture!
 */
async function getPlaceEnrichment(placeId: string): Promise<PlaceEnrichment> {
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  
  // ALL Enterprise+Atmosphere tier fields - maximize data capture at $25/1000
  const fieldMask = [
    // Reviews & Summary
    'reviews',
    'editorialSummary',
    
    // Atmosphere - general
    'allowsDogs',
    'goodForChildren',
    'goodForGroups',
    'goodForWatchingSports',
    'liveMusic',
    'menuForChildren',
    'outdoorSeating',
    'reservable',
    'restroom',
    
    // Atmosphere - food & drink
    'servesBeer',
    'servesBreakfast',
    'servesBrunch',
    'servesCocktails',
    'servesCoffee',
    'servesDessert',
    'servesDinner',
    'servesLunch',
    'servesVegetarianFood',
    'servesWine',
    
    // Service options
    'curbsidePickup',
    'delivery',
    'dineIn',
    'takeout',
    
    // Additional useful fields
    'parkingOptions',
    'paymentOptions',
    'accessibilityOptions',
  ].join(',');

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
async function getBusinessesNeedingEnrichment(
  placeIds?: string[], 
  filterRules: FilterRule[] = []
): Promise<Business[]> {
  const businesses: Business[] = [];
  let lastKey: Record<string, unknown> | undefined;

  // Build base filter expression
  let baseExpression = '(attribute_not_exists(reviews_fetched) OR reviews_fetched = :false) AND details_fetched = :true';
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
        (!b.reviews_fetched) && 
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
 * Update business with reviews, editorial summary, and all atmosphere data
 */
async function updateBusinessWithEnrichment(placeId: string, enrichment: PlaceEnrichment): Promise<void> {
  // Transform reviews to a cleaner format
  const reviews = (enrichment.reviews || [])
    .slice(0, 5) // Keep top 5 reviews
    .filter(r => r.text?.text)
    .map(r => ({
      text: r.text?.text || '',
      originalText: r.originalText?.text || null,
      authorName: r.authorAttribution?.displayName || 'Anonymous',
      authorDisplayName: formatAuthorDisplayName(r.authorAttribution?.displayName || ''),
      authorUri: r.authorAttribution?.uri || '',
      authorPhotoUri: r.authorAttribution?.photoUri || null,
      rating: r.rating,
      relativeTime: r.relativePublishTimeDescription,
      publishTime: r.publishTime || null,
    }));

  const updateFields: Record<string, unknown> = {
    // Reviews & Summary
    reviews: JSON.stringify(reviews),
    editorial_summary: enrichment.editorialSummary?.text || '',
    review_count: reviews.length,
    
    // Atmosphere - general
    allows_dogs: enrichment.allowsDogs ?? null,
    good_for_children: enrichment.goodForChildren ?? null,
    good_for_groups: enrichment.goodForGroups ?? null,
    good_for_watching_sports: enrichment.goodForWatchingSports ?? null,
    live_music: enrichment.liveMusic ?? null,
    menu_for_children: enrichment.menuForChildren ?? null,
    outdoor_seating: enrichment.outdoorSeating ?? null,
    reservable: enrichment.reservable ?? null,
    has_restroom: enrichment.restroom ?? null,
    
    // Atmosphere - food & drink
    serves_beer: enrichment.servesBeer ?? null,
    serves_breakfast: enrichment.servesBreakfast ?? null,
    serves_brunch: enrichment.servesBrunch ?? null,
    serves_cocktails: enrichment.servesCocktails ?? null,
    serves_coffee: enrichment.servesCoffee ?? null,
    serves_dessert: enrichment.servesDessert ?? null,
    serves_dinner: enrichment.servesDinner ?? null,
    serves_lunch: enrichment.servesLunch ?? null,
    serves_vegetarian: enrichment.servesVegetarianFood ?? null,
    serves_wine: enrichment.servesWine ?? null,
    
    // Service options
    has_curbside_pickup: enrichment.curbsidePickup ?? null,
    has_delivery: enrichment.delivery ?? null,
    has_dine_in: enrichment.dineIn ?? null,
    has_takeout: enrichment.takeout ?? null,
    
    // Additional options (as JSON for flexibility)
    parking_options: enrichment.parkingOptions ? JSON.stringify(enrichment.parkingOptions) : null,
    payment_options: enrichment.paymentOptions ? JSON.stringify(enrichment.paymentOptions) : null,
    accessibility_options: enrichment.accessibilityOptions ? JSON.stringify(enrichment.accessibilityOptions) : null,
    
    // Pipeline status flags
    reviews_fetched: true,
    pipeline_status: 'reviews', // Denormalized for GSI
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

// ============ Job Metrics ============

/**
 * Update job metrics in DynamoDB
 */
async function updateJobMetrics(
  jobId: string, 
  metrics: { processed: number; failed: number; filtered: number; with_reviews: number; without_reviews: number }
): Promise<void> {
  if (!JOBS_TABLE_NAME) {
    console.warn('JOBS_TABLE_NAME not set, skipping metrics update');
    return;
  }
  
  try {
    await docClient.send(new UpdateCommand({
      TableName: JOBS_TABLE_NAME,
      Key: { job_id: jobId },
      UpdateExpression: 'SET metrics.#step = :metrics',
      ExpressionAttributeNames: { '#step': 'enrich' },
      ExpressionAttributeValues: { ':metrics': metrics },
    }));
    console.log(`Updated job metrics for ${jobId}`);
  } catch (error) {
    console.error('Failed to update job metrics:', error);
  }
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

  const jobId = jobInput.jobId;
  const placeIds = jobInput.placeIds;
  const concurrency = jobInput.concurrency || 5;
  const skipIfDone = jobInput.skipIfDone !== false; // Default true
  const filterRules = jobInput.filterRules || [];

  console.log(`Concurrency: ${concurrency}`);
  console.log(`Specific place IDs: ${placeIds ? placeIds.length : 'all needing enrichment'}`);
  console.log(`Skip if already done: ${skipIfDone}`);
  console.log(`Filter rules: ${filterRules.length > 0 ? JSON.stringify(filterRules) : 'none'}`);

  // Get businesses that need enrichment
  let businesses = await getBusinessesNeedingEnrichment(placeIds, filterRules);
  
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
  
  // Update job metrics
  if (jobId) {
    await updateJobMetrics(jobId, {
      processed,
      failed,
      filtered: 0, // Enrich task processes all businesses that pass filter rules
      with_reviews: withReviews,
      without_reviews: withoutReviews,
    });
  }
  
  console.log('Next step: Run copy-task to generate LLM copy');
}

main().catch(error => {
  console.error('Task failed:', error);
  process.exit(1);
});
