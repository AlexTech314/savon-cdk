import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as crypto from 'crypto';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!;
const BUSINESSES_TABLE_NAME = process.env.BUSINESSES_TABLE_NAME!;
const SEARCH_CACHE_TABLE_NAME = process.env.SEARCH_CACHE_TABLE_NAME!;

// TTL for search cache: 30 days
const CACHE_TTL_DAYS = 30;

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
  
  // Search input
  searches?: SearchQuery[];
  maxResultsPerSearch?: number;
  
  // Options
  concurrency?: number;
  skipIfDone?: boolean;
  
  // Cache options
  skipCachedSearches?: boolean; // Skip searches run in the last 30 days
}

interface PlaceBasic {
  id: string;
  displayName?: { text: string };
  primaryType?: string;
}

interface SearchResponse {
  places?: PlaceBasic[];
  nextPageToken?: string;
}

// ============ API Functions ============

/**
 * Search for places using Text Search API (Pro tier: $32/1000)
 * Only requests: places.id, places.displayName, places.primaryType
 */
async function searchPlaces(query: string, options?: { includedType?: string; maxResults?: number }): Promise<PlaceBasic[]> {
  const allPlaces: PlaceBasic[] = [];
  let pageToken: string | undefined;
  const maxResults = Math.min(options?.maxResults ?? 60, 60); // Google API limit is 60 per query
  
  // Pro tier fields only - NO websiteUri (that's Enterprise tier)
  // MUST include nextPageToken for pagination to work!
  const fieldMask = 'places.id,places.displayName,places.primaryType,nextPageToken';
  const url = 'https://places.googleapis.com/v1/places:searchText';

  do {
    await rateLimiter.acquire();
    
    const body: Record<string, unknown> = { 
      textQuery: query, 
      pageSize: 20,
    };
    if (options?.includedType) body.includedType = options.includedType;
    if (pageToken) body.pageToken = pageToken;
    
    console.log(`    API Request: ${JSON.stringify(body)}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
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
 * Transform search result to minimal business record
 * Only saves: place_id, business_name, business_type, search_query, searched flag
 */
function transformToSearchRecord(place: PlaceBasic, search: SearchQuery): Record<string, unknown> {
  return {
    place_id: place.id,
    business_name: place.displayName?.text || 'Unknown',
    business_type: search.includedType || place.primaryType || 'unknown',
    primary_type: place.primaryType || null,
    search_query: search.textQuery,
    
    // Pipeline status flags
    searched: true,
    details_fetched: false,
    reviews_fetched: false,
    photos_fetched: false,
    copy_generated: false,
    
    // Timestamps
    created_at: new Date().toISOString(),
    searched_at: new Date().toISOString(),
  };
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

async function main(): Promise<void> {
  console.log('=== Search Task (Pro Tier: $32/1000) ===');
  console.log(`Table: ${BUSINESSES_TABLE_NAME}`);
  
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
    searches = [], 
    maxResultsPerSearch = 60,
    skipCachedSearches = false,
  } = jobInput;

  if (searches.length === 0) {
    console.error('No searches provided in job input');
    process.exit(1);
  }

  console.log(`Processing ${searches.length} searches...`);
  console.log(`Max results per search: ${maxResultsPerSearch}`);
  console.log(`Skip cached searches: ${skipCachedSearches}`);
  console.log(`Search cache table: ${SEARCH_CACHE_TABLE_NAME}`);

  const allBusinesses: Record<string, unknown>[] = [];
  const seenPlaceIds = new Set<string>();
  let skippedCount = 0;

  for (let i = 0; i < searches.length; i++) {
    const search = searches[i];
    console.log(`\n[${i + 1}/${searches.length}] Searching: "${search.textQuery}" (type: ${search.includedType || 'any'})`);
    
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
      
      // Search with Pro tier fields only (id, displayName, primaryType)
      const places = await searchPlaces(search.textQuery, {
        includedType: search.includedType,
        maxResults: maxResultsPerSearch,
      });

      // Write to cache (always, to track when searches were last run)
      await writeSearchCache(search, places.length);

      // Deduplicate by place_id
      const newPlaces = places.filter(p => !seenPlaceIds.has(p.id));
      newPlaces.forEach(p => seenPlaceIds.add(p.id));

      console.log(`  Found ${places.length} places, ${newPlaces.length} new (after dedup)`);

      // Transform to minimal search records
      for (const place of newPlaces) {
        const record = transformToSearchRecord(place, search);
        allBusinesses.push(record);
      }
    } catch (error) {
      console.error(`  Error processing search:`, error);
    }
  }
  
  if (skipCachedSearches && skippedCount > 0) {
    console.log(`\n=== Skipped ${skippedCount} cached searches ===`);
  }

  console.log(`\n=== Writing ${allBusinesses.length} businesses to DynamoDB ===`);
  await writeToDynamoDB(allBusinesses);

  console.log('\n=== Search Task Complete ===');
  console.log(`Total businesses saved: ${allBusinesses.length}`);
  console.log('Next step: Run details-task to fetch full business details');
}

main().catch(error => {
  console.error('Task failed:', error);
  process.exit(1);
});
