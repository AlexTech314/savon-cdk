import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const s3Client = new S3Client({ region: process.env.AWS_REGION });

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

// Per-key rate limiting: 8 requests/second per key (conservative, Google allows 10/sec)
const RATE_LIMIT_PER_KEY_PER_SECOND = 8;

interface KeyRateLimiter {
  name: string;
  key: string;
  tokens: number;
  lastRefill: number;
}

// Create a rate limiter for each active key
const keyRateLimiters: KeyRateLimiter[] = activeKeyNames.map((name, i) => ({
  name,
  key: activeKeys[i],
  tokens: RATE_LIMIT_PER_KEY_PER_SECOND,
  lastRefill: Date.now(),
}));

let lastUsedKeyIndex = -1;

/**
 * Refill tokens for a rate limiter based on elapsed time
 */
function refillTokens(limiter: KeyRateLimiter): void {
  const now = Date.now();
  const elapsed = (now - limiter.lastRefill) / 1000;
  limiter.tokens = Math.min(
    RATE_LIMIT_PER_KEY_PER_SECOND,
    limiter.tokens + elapsed * RATE_LIMIT_PER_KEY_PER_SECOND
  );
  limiter.lastRefill = now;
}

/**
 * Get the next available API key, waiting if necessary.
 * Uses round-robin among keys that have available tokens.
 * If no key has tokens, waits for the first one to refill.
 */
async function getNextApiKey(): Promise<string> {
  if (keyRateLimiters.length === 0) {
    throw new Error('No active Google API keys configured');
  }

  return new Promise((resolve) => {
    const tryAcquire = () => {
      // Refill all limiters
      keyRateLimiters.forEach(refillTokens);

      // Try round-robin starting from the next key after last used
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

      // No key has tokens - find the one that will refill soonest
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
const SEARCH_CACHE_TABLE_NAME = process.env.SEARCH_CACHE_TABLE_NAME!;
const CAMPAIGN_DATA_BUCKET = process.env.CAMPAIGN_DATA_BUCKET!;

// TTL for search cache: 30 days
const CACHE_TTL_DAYS = 30;

// ============ Types ============

/**
 * Data tier determines which Google Places API fields are fetched during search.
 * 
 * - pro: $32/1000 - Basic data (address, location, types, business status)
 * - enterprise: $35/1000 - Pro + phone, website, rating, hours, price level
 * - enterprise_atmosphere: $40/1000 - Enterprise + reviews, atmosphere data
 */
type DataTier = 'pro' | 'enterprise' | 'enterprise_atmosphere';

interface SearchQuery {
  textQuery: string;
  includedType?: string;
}

interface JobInput {
  // Task flags
  runSearch?: boolean;
  runDetails?: boolean;
  runEnrich?: boolean;
  runPhotos?: boolean;
  runCopy?: boolean;
  
  // Search input - searches are stored in S3
  searchesS3Key?: string;  // S3 key to fetch searches from
  maxResultsPerSearch?: number;
  dataTier?: DataTier;
  
  // Options
  concurrency?: number;
  skipIfDone?: boolean;
  
  // Cache options
  skipCachedSearches?: boolean; // Skip searches run in the last 30 days
}

interface OpeningHours {
  openNow?: boolean;
  weekdayDescriptions?: string[];
  periods?: Array<{
    open: { day: number; hour: number; minute: number };
    close?: { day: number; hour: number; minute: number };
  }>;
}

interface PlaceResult {
  id: string;
  displayName?: { text: string };
  primaryType?: string;
  primaryTypeDisplayName?: { text: string };
  types?: string[];
  formattedAddress?: string;
  addressComponents?: Array<{
    longText: string;
    shortText: string;
    types: string[];
  }>;
  location?: { latitude: number; longitude: number };
  googleMapsUri?: string;
  businessStatus?: string;
  utcOffsetMinutes?: number;
  iconMaskBaseUri?: string;
  iconBackgroundColor?: string;
  
  // Enterprise tier fields
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  priceRange?: { startPrice?: { units: string }; endPrice?: { units: string } };
  regularOpeningHours?: OpeningHours;
  currentOpeningHours?: OpeningHours;
  
  // Enterprise + Atmosphere tier fields
  reviews?: Array<{
    text?: { text: string };
    rating?: number;
    authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
    relativePublishTimeDescription?: string;
    publishTime?: string;
  }>;
  editorialSummary?: { text: string };
  
  // Atmosphere booleans
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
  curbsidePickup?: boolean;
  delivery?: boolean;
  dineIn?: boolean;
  takeout?: boolean;
  
  // Additional options
  parkingOptions?: Record<string, boolean>;
  paymentOptions?: Record<string, boolean>;
  accessibilityOptions?: Record<string, boolean>;
}

interface SearchResponse {
  places?: PlaceResult[];
  nextPageToken?: string;
}

// ============ Field Masks by Tier ============

/**
 * Get the field mask for the specified data tier
 */
function getFieldMaskForTier(tier: DataTier): string {
  // Pro tier fields ($32/1000) - basic data
  const proFields = [
    'places.id',
    'places.displayName',
    'places.primaryType',
    'places.primaryTypeDisplayName',
    'places.types',
    'places.formattedAddress',
    'places.addressComponents',
    'places.location',
    'places.googleMapsUri',
    'places.businessStatus',
    'places.utcOffsetMinutes',
    'places.iconMaskBaseUri',
    'places.iconBackgroundColor',
  ];
  
  // Enterprise tier fields ($35/1000) - Pro + contact & ratings
  const enterpriseFields = [
    ...proFields,
    'places.nationalPhoneNumber',
    'places.internationalPhoneNumber',
    'places.websiteUri',
    'places.rating',
    'places.userRatingCount',
    'places.priceLevel',
    'places.priceRange',
    'places.regularOpeningHours',
    'places.currentOpeningHours',
  ];
  
  // Enterprise + Atmosphere tier fields ($40/1000) - Enterprise + reviews & atmosphere
  const atmosphereFields = [
    ...enterpriseFields,
    'places.reviews',
    'places.editorialSummary',
    // Atmosphere booleans
    'places.allowsDogs',
    'places.goodForChildren',
    'places.goodForGroups',
    'places.goodForWatchingSports',
    'places.liveMusic',
    'places.menuForChildren',
    'places.outdoorSeating',
    'places.reservable',
    'places.restroom',
    'places.servesBeer',
    'places.servesBreakfast',
    'places.servesBrunch',
    'places.servesCocktails',
    'places.servesCoffee',
    'places.servesDessert',
    'places.servesDinner',
    'places.servesLunch',
    'places.servesVegetarianFood',
    'places.servesWine',
    'places.curbsidePickup',
    'places.delivery',
    'places.dineIn',
    'places.takeout',
    'places.parkingOptions',
    'places.paymentOptions',
    'places.accessibilityOptions',
  ];
  
  let fields: string[];
  switch (tier) {
    case 'pro':
      fields = proFields;
      break;
    case 'enterprise':
      fields = enterpriseFields;
      break;
    case 'enterprise_atmosphere':
      fields = atmosphereFields;
      break;
    default:
      fields = enterpriseFields; // Default to enterprise
  }
  
  // Always include nextPageToken for pagination
  return [...fields, 'nextPageToken'].join(',');
}

// ============ API Functions ============

/**
 * Search for places using Text Search API
 * Cost depends on tier: Pro $32/1000, Enterprise $35/1000, Enterprise+Atmosphere $40/1000
 */
async function searchPlaces(
  query: string,
  options?: { maxResults?: number; dataTier?: DataTier }
): Promise<PlaceResult[]> {
  const allPlaces: PlaceResult[] = [];
  let pageToken: string | undefined;
  const maxResults = Math.min(options?.maxResults ?? 60, 60); // Google API limit is 60 per query
  const dataTier = options?.dataTier || 'enterprise';
  
  const fieldMask = getFieldMaskForTier(dataTier);
  const url = 'https://places.googleapis.com/v1/places:searchText';

  do {
    const body: Record<string, unknown> = { 
      textQuery: query, 
      pageSize: 20,
    };
    // Note: includedType intentionally not used - it causes missed leads
    if (pageToken) body.pageToken = pageToken;
    
    console.log(`    API Request: ${JSON.stringify(body)}`);
    
    // Get next available key (waits if rate limited)
    const apiKey = await getNextApiKey();
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Places API search failed: ${response.status} - ${errorText}`);
      break;
    }

    const data = await response.json() as SearchResponse;
    
    if (!data.places || data.places.length === 0) {
      console.log(`    API Response: No places returned. Raw response keys: ${Object.keys(data).join(', ') || 'empty'}`);
    }
    
    allPlaces.push(...(data.places || []));
    pageToken = data.nextPageToken;
    
    console.log(`    Page fetched: ${data.places?.length || 0} results (total: ${allPlaces.length})${pageToken ? ' [has nextPageToken]' : ' [no more pages]'}`);
    
    // Wait for token validity before next page (Google requires ~2s between paginated requests)
    if (pageToken && allPlaces.length < maxResults) {
      console.log(`    Fetching next page (target: ${maxResults})...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  } while (pageToken && allPlaces.length < maxResults);
  
  console.log(`    Search complete: ${allPlaces.length} total results`);
  
  return allPlaces.slice(0, maxResults);
}

// ============ Helper Functions ============

/**
 * Extract address component by type
 */
function extractAddressComponent(components: PlaceResult['addressComponents'], type: string): string {
  if (!components) return '';
  const component = components.find(c => c.types.includes(type));
  return component?.longText || component?.shortText || '';
}

/**
 * Extract city from formatted address (fallback if addressComponents missing)
 */
function extractCityFromAddress(formattedAddress: string): string {
  const parts = formattedAddress.split(',').map(p => p.trim());
  return parts.length >= 3 ? parts[1] : parts[0] || '';
}

/**
 * Format author display name (e.g., "John Smith" -> "John S.")
 */
function formatAuthorDisplayName(fullName: string): string {
  if (!fullName) return 'Anonymous';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
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
 * Transform search result to comprehensive business record
 * Fields populated depend on the data tier used
 */
function transformToSearchRecord(
  place: PlaceResult, 
  search: SearchQuery,
  dataTier: DataTier
): Record<string, unknown> {
  // Extract address components
  const streetNumber = extractAddressComponent(place.addressComponents, 'street_number');
  const route = extractAddressComponent(place.addressComponents, 'route');
  const city = extractAddressComponent(place.addressComponents, 'locality') || 
               extractAddressComponent(place.addressComponents, 'sublocality') ||
               (place.formattedAddress ? extractCityFromAddress(place.formattedAddress) : '');
  const state = extractAddressComponent(place.addressComponents, 'administrative_area_level_1');
  const zipCode = extractAddressComponent(place.addressComponents, 'postal_code');
  const country = extractAddressComponent(place.addressComponents, 'country');
  
  // Base record with Pro tier fields (always included)
  const record: Record<string, unknown> = {
    place_id: place.id,
    business_name: place.displayName?.text || 'Unknown',
    business_type: place.primaryType || 'unknown',
    primary_type: place.primaryType || null,
    primary_type_display_name: place.primaryTypeDisplayName?.text || null,
    types: place.types ? JSON.stringify(place.types) : null,
    search_query: search.textQuery,
    data_tier: dataTier,
    
    // Address fields (Pro tier)
    address: place.formattedAddress || '',
    street: [streetNumber, route].filter(Boolean).join(' ') || null,
    city: city || null,
    state: state || null,
    zip_code: zipCode || null,
    country: country || null,
    
    // Location (Pro tier)
    latitude: place.location?.latitude || null,
    longitude: place.location?.longitude || null,
    
    // Additional Pro tier fields
    google_maps_uri: place.googleMapsUri || null,
    business_status: place.businessStatus || null,
    utc_offset_minutes: place.utcOffsetMinutes ?? null,
    icon_mask_uri: place.iconMaskBaseUri || null,
    icon_background_color: place.iconBackgroundColor || null,
    
    // Generate friendly slug
    friendly_slug: `${(place.displayName?.text || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${place.id.slice(-8)}`,
    
    // Pipeline status flags - set based on tier
    searched: true,
    details_fetched: dataTier === 'enterprise' || dataTier === 'enterprise_atmosphere',
    reviews_fetched: dataTier === 'enterprise_atmosphere',
    photos_fetched: false, // Photos always need separate task
    copy_generated: false,
    
    // Timestamps
    created_at: new Date().toISOString(),
    searched_at: new Date().toISOString(),
  };
  
  // Add Enterprise tier fields if applicable
  if (dataTier === 'enterprise' || dataTier === 'enterprise_atmosphere') {
    const hasWebsite = !!place.websiteUri;
    
    Object.assign(record, {
      // Phone & Contact
      phone: place.nationalPhoneNumber || '',
      international_phone: place.internationalPhoneNumber || null,
      website_uri: place.websiteUri || null,
      has_website: hasWebsite,
      
      // Ratings & Pricing
      rating: place.rating || null,
      rating_count: place.userRatingCount || null,
      price_level: formatPriceLevel(place.priceLevel),
      price_range_start: place.priceRange?.startPrice?.units || null,
      price_range_end: place.priceRange?.endPrice?.units || null,
      
      // Hours
      hours: place.regularOpeningHours?.weekdayDescriptions?.join('; ') || '',
      hours_json: place.regularOpeningHours ? JSON.stringify(place.regularOpeningHours) : null,
      current_hours_json: place.currentOpeningHours ? JSON.stringify(place.currentOpeningHours) : null,
      is_open_now: place.currentOpeningHours?.openNow ?? null,
      
      details_fetched_at: new Date().toISOString(),
    });
  }
  
  // Add Atmosphere tier fields if applicable
  if (dataTier === 'enterprise_atmosphere') {
    // Transform reviews
    const reviews = (place.reviews || [])
      .slice(0, 5)
      .filter(r => r.text?.text)
      .map(r => ({
        text: r.text?.text || '',
        authorName: r.authorAttribution?.displayName || 'Anonymous',
        authorDisplayName: formatAuthorDisplayName(r.authorAttribution?.displayName || ''),
        authorUri: r.authorAttribution?.uri || '',
        authorPhotoUri: r.authorAttribution?.photoUri || null,
        rating: r.rating,
        relativeTime: r.relativePublishTimeDescription,
        publishTime: r.publishTime || null,
      }));
    
    Object.assign(record, {
      // Reviews & Summary
      reviews: JSON.stringify(reviews),
      editorial_summary: place.editorialSummary?.text || '',
      review_count: reviews.length,
      
      // Atmosphere - general
      allows_dogs: place.allowsDogs ?? null,
      good_for_children: place.goodForChildren ?? null,
      good_for_groups: place.goodForGroups ?? null,
      good_for_watching_sports: place.goodForWatchingSports ?? null,
      live_music: place.liveMusic ?? null,
      menu_for_children: place.menuForChildren ?? null,
      outdoor_seating: place.outdoorSeating ?? null,
      reservable: place.reservable ?? null,
      has_restroom: place.restroom ?? null,
      
      // Atmosphere - food & drink
      serves_beer: place.servesBeer ?? null,
      serves_breakfast: place.servesBreakfast ?? null,
      serves_brunch: place.servesBrunch ?? null,
      serves_cocktails: place.servesCocktails ?? null,
      serves_coffee: place.servesCoffee ?? null,
      serves_dessert: place.servesDessert ?? null,
      serves_dinner: place.servesDinner ?? null,
      serves_lunch: place.servesLunch ?? null,
      serves_vegetarian: place.servesVegetarianFood ?? null,
      serves_wine: place.servesWine ?? null,
      
      // Service options
      has_curbside_pickup: place.curbsidePickup ?? null,
      has_delivery: place.delivery ?? null,
      has_dine_in: place.dineIn ?? null,
      has_takeout: place.takeout ?? null,
      
      // Additional options
      parking_options: place.parkingOptions ? JSON.stringify(place.parkingOptions) : null,
      payment_options: place.paymentOptions ? JSON.stringify(place.paymentOptions) : null,
      accessibility_options: place.accessibilityOptions ? JSON.stringify(place.accessibilityOptions) : null,
      
      reviews_fetched_at: new Date().toISOString(),
    });
  }
  
  return record;
}

async function writeToDynamoDB(businesses: Record<string, unknown>[]): Promise<void> {
  if (businesses.length === 0) return;

  // Batch write (25 items at a time - DynamoDB limit)
  for (let i = 0; i < businesses.length; i += 25) {
    const batch = businesses.slice(i, i + 25);
    
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [BUSINESSES_TABLE_NAME]: batch.map(item => ({
          PutRequest: { Item: item },
        })),
      },
    }));
    
    console.log(`Wrote batch of ${batch.length} items to DynamoDB`);
  }
}

// ============ Search Cache Functions ============

/**
 * Generate a hash key for a search query
 * Uses MD5 hash of textQuery + includedType
 */
function getQueryHash(search: SearchQuery): string {
  const key = `${search.textQuery}|${search.includedType || ''}`;
  return crypto.createHash('md5').update(key).digest('hex');
}

/**
 * Check if a search query exists in the cache
 * Returns the cached entry if found and not expired, null otherwise
 */
async function checkSearchCache(search: SearchQuery): Promise<{ lastRunAt: string } | null> {
  const queryHash = getQueryHash(search);
  
  try {
    const result = await docClient.send(new GetCommand({
      TableName: SEARCH_CACHE_TABLE_NAME,
      Key: { query_hash: queryHash },
    }));
    
    if (result.Item) {
      return { lastRunAt: result.Item.last_run_at as string };
    }
  } catch (error) {
    console.error(`  Cache check failed:`, error);
  }
  
  return null;
}

/**
 * Write a search query to the cache
 */
async function writeSearchCache(search: SearchQuery, resultsCount: number): Promise<void> {
  const queryHash = getQueryHash(search);
  const now = new Date();
  const ttl = Math.floor(now.getTime() / 1000) + (CACHE_TTL_DAYS * 24 * 60 * 60);
  
  try {
    await docClient.send(new PutCommand({
      TableName: SEARCH_CACHE_TABLE_NAME,
      Item: {
        query_hash: queryHash,
        text_query: search.textQuery,
        included_type: search.includedType || null,
        last_run_at: now.toISOString(),
        results_count: resultsCount,
        ttl, // TTL in seconds since epoch
      },
    }));
  } catch (error) {
    console.error(`  Cache write failed:`, error);
  }
}

// ============ Main ============

const TIER_COSTS: Record<DataTier, number> = {
  pro: 32,
  enterprise: 35,
  enterprise_atmosphere: 40,
};

const TIER_DESCRIPTIONS: Record<DataTier, string> = {
  pro: 'Pro ($32/1000) - address, location, types',
  enterprise: 'Enterprise ($35/1000) - Pro + phone, website, rating, hours',
  enterprise_atmosphere: 'Enterprise+Atmosphere ($40/1000) - Enterprise + reviews, atmosphere',
};

/**
 * Fetch searches from S3
 */
async function fetchSearchesFromS3(s3Key: string): Promise<SearchQuery[]> {
  console.log(`Fetching searches from S3: ${CAMPAIGN_DATA_BUCKET}/${s3Key}`);
  
  try {
    const result = await s3Client.send(new GetObjectCommand({
      Bucket: CAMPAIGN_DATA_BUCKET,
      Key: s3Key,
    }));
    
    const bodyStr = await result.Body?.transformToString();
    if (!bodyStr) {
      console.error('S3 object body is empty');
      return [];
    }
    
    const data = JSON.parse(bodyStr);
    const searches = data.searches || [];
    console.log(`Loaded ${searches.length} searches from S3`);
    return searches;
  } catch (error) {
    console.error(`Failed to fetch searches from S3 (${s3Key}):`, error);
    throw error;
  }
}

async function main(): Promise<void> {
  // Parse job input from environment
  const jobInputStr = process.env.JOB_INPUT;
  let jobInput: JobInput = {};
  
  if (jobInputStr) {
    try {
      jobInput = JSON.parse(jobInputStr);
    } catch (e) {
      console.error('Could not parse JOB_INPUT:', e);
      process.exit(1);
    }
  }

  const { 
    searchesS3Key,
    maxResultsPerSearch = 60,
    skipCachedSearches = false,
    dataTier = 'enterprise',
  } = jobInput;

  console.log(`=== Search Task - ${TIER_DESCRIPTIONS[dataTier]} ===`);
  console.log(`Table: ${BUSINESSES_TABLE_NAME}`);

  // Fetch searches from S3
  if (!searchesS3Key) {
    console.error('No searchesS3Key provided in job input');
    process.exit(1);
  }

  const searches = await fetchSearchesFromS3(searchesS3Key);

  if (searches.length === 0) {
    console.error('No searches found in S3 file');
    process.exit(1);
  }

  console.log(`Processing ${searches.length} searches...`);
  console.log(`Max results per search: ${maxResultsPerSearch}`);
  console.log(`Data tier: ${dataTier} ($${TIER_COSTS[dataTier]}/1000)`);
  console.log(`Skip cached searches: ${skipCachedSearches}`);
  console.log(`Search cache table: ${SEARCH_CACHE_TABLE_NAME}`);
  
  // Log what pipeline steps will be marked complete
  console.log(`\nPipeline flags that will be set:`);
  console.log(`  - searched: true`);
  console.log(`  - details_fetched: ${dataTier === 'enterprise' || dataTier === 'enterprise_atmosphere'}`);
  console.log(`  - reviews_fetched: ${dataTier === 'enterprise_atmosphere'}`);

  const seenPlaceIds = new Set<string>();
  let totalSaved = 0;
  let skippedCount = 0;

  for (let i = 0; i < searches.length; i++) {
    const search = searches[i];
    console.log(`\n[${i + 1}/${searches.length}] Searching: "${search.textQuery}"`);
    
    try {
      // Check cache if skipCachedSearches is enabled
      if (skipCachedSearches) {
        const cached = await checkSearchCache(search);
        if (cached) {
          console.log(`  SKIPPED - cached from ${cached.lastRunAt}`);
          skippedCount++;
          continue;
        }
      }
      
      // Search with tier-appropriate fields (includedType not used - causes missed leads)
      const places = await searchPlaces(search.textQuery, {
        maxResults: maxResultsPerSearch,
        dataTier,
      });

      // Write to cache (always, to track when searches were last run)
      await writeSearchCache(search, places.length);

      // Deduplicate by place_id (across all searches in this job)
      const newPlaces = places.filter(p => !seenPlaceIds.has(p.id));
      newPlaces.forEach(p => seenPlaceIds.add(p.id));

      console.log(`  Found ${places.length} places, ${newPlaces.length} new (after dedup)`);

      // Transform to comprehensive records and write immediately
      if (newPlaces.length > 0) {
        const records = newPlaces.map(place => transformToSearchRecord(place, search, dataTier));
        await writeToDynamoDB(records);
        totalSaved += records.length;
        console.log(`  Saved ${records.length} businesses to DynamoDB (total: ${totalSaved})`);
      }
    } catch (error) {
      console.error(`  Error processing search:`, error);
      // Continue with next search - don't fail the entire job
    }
  }
  
  if (skipCachedSearches && skippedCount > 0) {
    console.log(`\n=== Skipped ${skippedCount} cached searches ===`);
  }

  console.log('\n=== Search Task Complete ===');
  console.log(`Total businesses saved: ${totalSaved}`);
  console.log(`Data tier used: ${dataTier}`);
  
  if (dataTier === 'enterprise_atmosphere') {
    console.log('All data fetched! Next step: Run photos-task for photos, then copy-task for LLM copy');
  } else if (dataTier === 'enterprise') {
    console.log('Details fetched! Next step: Run enrich-task for reviews, or photos-task for photos');
  } else {
    console.log('Basic data fetched. Next step: Run details-task to fetch contact info & ratings');
  }
}

main().catch(error => {
  console.error('Task failed:', error);
  process.exit(1);
});
