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
  field: string;  // e.g., 'state', 'city', 'business_type'
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
  
  // Filter rules - only process businesses matching ALL rules
  filterRules?: FilterRule[];
}

// ============ Filter Rule Helpers ============

/**
 * Build DynamoDB filter expression from filter rules
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

interface Business {
  place_id: string;
  business_name: string;
  business_type?: string;
  searched?: boolean;
  details_fetched?: boolean;
  has_website?: boolean;
  [key: string]: unknown;
}

interface OpeningHours {
  openNow?: boolean;
  weekdayDescriptions?: string[];
  periods?: Array<{
    open: { day: number; hour: number; minute: number };
    close?: { day: number; hour: number; minute: number };
  }>;
}

interface PlaceDetails {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  addressComponents?: Array<{ longText: string; shortText: string; types: string[] }>;
  location?: { latitude: number; longitude: number };
  googleMapsUri?: string;
  primaryType?: string;
  
  // Enterprise tier fields
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;  // PRICE_LEVEL_FREE, PRICE_LEVEL_INEXPENSIVE, etc.
  priceRange?: { startPrice?: { units: string }; endPrice?: { units: string } };
  regularOpeningHours?: OpeningHours;
  currentOpeningHours?: OpeningHours;
  regularSecondaryOpeningHours?: Array<{ type: string; periods: OpeningHours['periods'] }>;
  currentSecondaryOpeningHours?: Array<{ type: string; periods: OpeningHours['periods'] }>;
}

// ============ API Functions ============

/**
 * Get place details using Place Details API (Enterprise tier: $20/1000)
 * Captures ALL Enterprise tier fields for maximum data
 * 
 * Does NOT request: reviews, editorialSummary, atmosphere fields (those are Enterprise+Atmosphere tier @ $25/1000)
 */
async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  
  // ALL Enterprise tier fields - maximize data capture at $20/1000
  const fieldMask = [
    // Basic fields (may already have from search, but good to re-verify)
    'id',
    'displayName',
    'formattedAddress',
    'addressComponents',
    'location',
    'googleMapsUri',
    'primaryType',
    
    // Enterprise tier fields - phone & contact
    'nationalPhoneNumber',
    'internationalPhoneNumber',
    'websiteUri',
    
    // Enterprise tier fields - ratings & pricing
    'rating',
    'userRatingCount',
    'priceLevel',
    'priceRange',
    
    // Enterprise tier fields - hours
    'regularOpeningHours',
    'currentOpeningHours',
    'regularSecondaryOpeningHours',
    'currentSecondaryOpeningHours',
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
    throw new Error(`Places API details failed: ${response.status} - ${await response.text()}`);
  }

  return await response.json() as PlaceDetails;
}

// ============ Helper Functions ============

function extractCity(formattedAddress: string): string {
  const parts = formattedAddress.split(',').map(p => p.trim());
  return parts.length >= 3 ? parts[1] : parts[0] || '';
}

function extractAddressComponent(components: PlaceDetails['addressComponents'], type: string): string {
  if (!components) return '';
  const component = components.find(c => c.types.includes(type));
  return component?.longText || component?.shortText || '';
}

/**
 * Get businesses that need details fetched
 */
async function getBusinessesNeedingDetails(placeIds?: string[], filterRules: FilterRule[] = []): Promise<Business[]> {
  const businesses: Business[] = [];
  let lastKey: Record<string, unknown> | undefined;

  // Base filter: needs details and has been searched
  const baseExpression = '(attribute_not_exists(details_fetched) OR details_fetched = :false) AND searched = :true';
  const baseValues: Record<string, unknown> = { ':false': false, ':true': true };

  // Build filter with rules
  const { expression, names, values } = buildFilterFromRules(
    filterRules,
    placeIds ? '' : baseExpression,  // Skip base if we have specific IDs
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
      // If specific IDs, filter to those and apply base condition
      businesses.push(...items.filter(b => 
        placeIds.includes(b.place_id) && 
        (!b.details_fetched) && 
        b.searched
      ));
    } else {
      businesses.push(...items);
    }
    
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return businesses;
}

/**
 * Convert price level enum to readable string
 */
function formatPriceLevel(priceLevel?: string): string | null {
  if (!priceLevel) return null;
  const mapping: Record<string, string> = {
    'PRICE_LEVEL_FREE': 'Free',
    'PRICE_LEVEL_INEXPENSIVE': '$',
    'PRICE_LEVEL_MODERATE': '$$',
    'PRICE_LEVEL_EXPENSIVE': '$$$',
    'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$',
  };
  return mapping[priceLevel] || priceLevel;
}

/**
 * Update business with details from Google Places API
 * Saves ALL Enterprise tier fields
 */
async function updateBusinessWithDetails(placeId: string, details: PlaceDetails): Promise<void> {
  const streetNumber = extractAddressComponent(details.addressComponents, 'street_number');
  const route = extractAddressComponent(details.addressComponents, 'route');
  const city = extractAddressComponent(details.addressComponents, 'locality') || 
               extractAddressComponent(details.addressComponents, 'sublocality') ||
               extractCity(details.formattedAddress || '');
  const state = extractAddressComponent(details.addressComponents, 'administrative_area_level_1');
  const country = extractAddressComponent(details.addressComponents, 'country');
  const hasWebsite = !!details.websiteUri;

  const updateFields: Record<string, unknown> = {
    // Address fields (re-verify from details API for accuracy)
    address: details.formattedAddress || '',
    city: city || null,
    state: state || null,
    street: [streetNumber, route].filter(Boolean).join(' ') || null,
    zip_code: extractAddressComponent(details.addressComponents, 'postal_code') || null,
    country: country || null,
    latitude: details.location?.latitude || null,
    longitude: details.location?.longitude || null,
    google_maps_uri: details.googleMapsUri || '',
    primary_type: details.primaryType || null,
    
    // Enterprise tier: Phone & Contact
    phone: details.nationalPhoneNumber || '',
    international_phone: details.internationalPhoneNumber || null,
    website_uri: details.websiteUri || null,
    
    // Enterprise tier: Ratings & Pricing
    rating: details.rating || null,
    rating_count: details.userRatingCount || null,
    price_level: formatPriceLevel(details.priceLevel),
    price_range_start: details.priceRange?.startPrice?.units || null,
    price_range_end: details.priceRange?.endPrice?.units || null,
    
    // Enterprise tier: Hours
    hours: details.regularOpeningHours?.weekdayDescriptions?.join('; ') || '',
    hours_json: details.regularOpeningHours ? JSON.stringify(details.regularOpeningHours) : null,
    current_hours_json: details.currentOpeningHours ? JSON.stringify(details.currentOpeningHours) : null,
    is_open_now: details.currentOpeningHours?.openNow ?? null,
    secondary_hours_json: details.regularSecondaryOpeningHours ? JSON.stringify(details.regularSecondaryOpeningHours) : null,
    
    // Update business name if we have a better one
    business_name: details.displayName?.text || undefined,
    
    // Generate friendly slug
    friendly_slug: `${(details.displayName?.text || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${placeId.slice(-8)}`,
    
    // Pipeline status flags
    details_fetched: true,
    has_website: hasWebsite,
    has_website_str: hasWebsite ? 'true' : 'false', // String version for GSI
    pipeline_status: 'details', // Denormalized for GSI
    details_fetched_at: new Date().toISOString(),
  };

  // Build update expression
  const updateParts: string[] = [];
  const expressionNames: Record<string, string> = {};
  const expressionValues: Record<string, unknown> = {};

  Object.entries(updateFields).forEach(([key, value], index) => {
    if (value !== undefined) {
      updateParts.push(`#attr${index} = :val${index}`);
      expressionNames[`#attr${index}`] = key;
      expressionValues[`:val${index}`] = value;
    }
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
  metrics: { processed: number; failed: number; filtered: number }
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
      ExpressionAttributeNames: { '#step': 'details' },
      ExpressionAttributeValues: { ':metrics': metrics },
    }));
    console.log(`Updated job metrics for ${jobId}`);
  } catch (error) {
    console.error('Failed to update job metrics:', error);
  }
}

// ============ Main ============

async function main(): Promise<void> {
  console.log('=== Details Task (Enterprise Tier: $20/1000) ===');
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
  console.log(`Specific place IDs: ${placeIds ? placeIds.length : 'all needing details'}`);
  console.log(`Skip if already done: ${skipIfDone}`);
  console.log(`Filter rules: ${filterRules.length > 0 ? JSON.stringify(filterRules) : 'none'}`);

  // Get businesses that need details
  let businesses = await getBusinessesNeedingDetails(placeIds, filterRules);
  
  // If skipIfDone is true and we have specific placeIds, filter out already-done ones
  if (skipIfDone && placeIds) {
    businesses = businesses.filter(b => !b.details_fetched);
  }
  
  console.log(`Found ${businesses.length} businesses needing details`);

  if (businesses.length === 0) {
    console.log('No businesses need details. Exiting.');
    return;
  }

  // Process with limited concurrency
  let processed = 0;
  let failed = 0;
  let withWebsite = 0;
  let withoutWebsite = 0;

  for (let i = 0; i < businesses.length; i += concurrency) {
    const batch = businesses.slice(i, i + concurrency);
    
    await Promise.all(batch.map(async (business) => {
      try {
        console.log(`\nFetching details for: ${business.business_name} (${business.place_id})`);
        
        const details = await getPlaceDetails(business.place_id);
        await updateBusinessWithDetails(business.place_id, details);
        
        processed++;
        if (details.websiteUri) {
          withWebsite++;
          console.log(`  ✓ Updated (has website - will be skipped for copy)`);
        } else {
          withoutWebsite++;
          console.log(`  ✓ Updated (no website - good candidate)`);
        }
      } catch (error) {
        failed++;
        console.error(`  ✗ Failed for ${business.business_name}:`, error);
      }
    }));

    console.log(`Progress: ${processed + failed}/${businesses.length}`);
  }

  console.log('\n=== Details Task Complete ===');
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`With website: ${withWebsite} (will be skipped)`);
  console.log(`Without website: ${withoutWebsite} (good candidates)`);
  
  // Update job metrics
  if (jobId) {
    await updateJobMetrics(jobId, {
      processed,
      failed,
      filtered: 0, // Details task doesn't filter, just processes what it receives
    });
  }
  
  console.log('Next step: Run enrich-task to fetch reviews');
}

main().catch(error => {
  console.error('Task failed:', error);
  process.exit(1);
});
