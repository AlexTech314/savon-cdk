import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

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

interface SearchQuery {
  textQuery: string;
  includedType?: string;
}

interface JobInput {
  searches: SearchQuery[];
  maxResultsPerSearch?: number;
  onlyWithoutWebsite?: boolean;
}

interface PlaceBasic {
  id: string;
  displayName?: { text: string };
  websiteUri?: string;
}

interface PlaceDetails {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  reviews?: Array<{
    text?: { text: string };
    rating?: number;
    authorAttribution?: { displayName?: string; uri?: string };
    relativePublishTimeDescription?: string;
  }>;
  editorialSummary?: { text: string };
  photos?: Array<{ name: string }>;
  googleMapsUri?: string;
  location?: { latitude: number; longitude: number };
  addressComponents?: Array<{ longText: string; shortText: string; types: string[] }>;
}

interface SearchOptions {
  includedType?: string;
  maxResults?: number;
}

interface SearchResponse {
  places?: PlaceBasic[];
  nextPageToken?: string;
}

// ============ API Functions ============

async function searchPlaces(query: string, options?: SearchOptions): Promise<PlaceBasic[]> {
  const allPlaces: PlaceBasic[] = [];
  let pageToken: string | undefined;
  const maxResults = Math.min(options?.maxResults ?? 60, 60); // Google API limit is 60 per query
  
  // Minimal fields for cheaper API tier (Essentials vs Pro)
  const fieldMask = 'places.id,places.displayName,places.websiteUri';
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
    
    console.log(`    Page fetched: ${data.places?.length || 0} results (total: ${allPlaces.length})`);
    
    // Wait for token validity before next page
    if (pageToken && allPlaces.length < maxResults) {
      await new Promise(r => setTimeout(r, 2000));
    }
  } while (pageToken && allPlaces.length < maxResults);
  
  return allPlaces.slice(0, maxResults);
}

async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  await rateLimiter.acquire();
  
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  const fieldMask = 'id,displayName,formattedAddress,nationalPhoneNumber,rating,userRatingCount,regularOpeningHours,reviews,editorialSummary,photos,googleMapsUri,location,addressComponents,websiteUri';

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
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

function buildPhotoUrl(photoName: string): string {
  return `https://places.googleapis.com/v1/${photoName}/media?key=${GOOGLE_API_KEY}&maxWidthPx=800`;
}

function formatAuthorDisplayName(fullName: string): string {
  if (!fullName) return 'Anonymous';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function transformToBusinessRecord(details: PlaceDetails, search: SearchQuery): Record<string, unknown> {
  const photoUrls = (details.photos || [])
    .slice(0, 5)
    .map(photo => buildPhotoUrl(photo.name));

  const reviews = (details.reviews || [])
    .slice(0, 3)
    .filter(r => r.text?.text)
    .map(r => ({
      text: r.text?.text || '',
      authorName: r.authorAttribution?.displayName || 'Anonymous',
      authorDisplayName: formatAuthorDisplayName(r.authorAttribution?.displayName || ''),
      authorUri: r.authorAttribution?.uri || '',
      rating: r.rating,
      relativeTime: r.relativePublishTimeDescription,
    }));

  const streetNumber = extractAddressComponent(details.addressComponents, 'street_number');
  const route = extractAddressComponent(details.addressComponents, 'route');
  const state = extractAddressComponent(details.addressComponents, 'administrative_area_level_1');

  return {
    place_id: details.id,
    business_name: details.displayName?.text || 'Unknown',
    business_type: search.includedType || 'unknown',
    search_query: search.textQuery,
    state: state,
    city: extractCity(details.formattedAddress || ''),
    address: details.formattedAddress || '',
    street: [streetNumber, route].filter(Boolean).join(' '),
    zip_code: extractAddressComponent(details.addressComponents, 'postal_code'),
    phone: details.nationalPhoneNumber || '',
    rating: details.rating || null,
    rating_count: details.userRatingCount || null,
    hours: details.regularOpeningHours?.weekdayDescriptions?.join('; ') || '',
    reviews: JSON.stringify(reviews),
    editorial_summary: details.editorialSummary?.text || '',
    photo_urls: JSON.stringify(photoUrls),
    google_maps_uri: details.googleMapsUri || '',
    latitude: details.location?.latitude || null,
    longitude: details.location?.longitude || null,
    friendly_slug: `${(details.displayName?.text || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${details.id.slice(-8)}`,
    created_at: new Date().toISOString(),
    copy_generated: false,
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

// ============ Main ============

async function main(): Promise<void> {
  console.log('=== Google Places Search Task ===');
  console.log(`Table: ${BUSINESSES_TABLE_NAME}`);
  
  // Parse job input from environment
  const jobInputStr = process.env.JOB_INPUT;
  let jobInput: JobInput = { searches: [] };
  
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
    maxResultsPerSearch = 500, 
    onlyWithoutWebsite = true 
  } = jobInput;

  if (searches.length === 0) {
    console.error('No searches provided in job input');
    process.exit(1);
  }

  console.log(`Processing ${searches.length} searches...`);
  console.log(`Max results per search: ${maxResultsPerSearch}`);
  console.log(`Only without website: ${onlyWithoutWebsite}`);

  const allBusinesses: Record<string, unknown>[] = [];
  const seenPlaceIds = new Set<string>();

  for (let i = 0; i < searches.length; i++) {
    const search = searches[i];
    console.log(`\n[${i + 1}/${searches.length}] Searching: "${search.textQuery}" (type: ${search.includedType || 'any'})`);
    
    try {
      // 1. Search with minimal fields (cheaper tier)
      const places = await searchPlaces(search.textQuery, {
        includedType: search.includedType,
        maxResults: maxResultsPerSearch,
      });

      // 2. Filter to places without websites (if enabled)
      const candidates = onlyWithoutWebsite 
        ? places.filter(p => !p.websiteUri)
        : places;

      // 3. Deduplicate by place_id
      const newCandidates = candidates.filter(p => !seenPlaceIds.has(p.id));
      newCandidates.forEach(p => seenPlaceIds.add(p.id));

      console.log(`  Found ${places.length} places, ${candidates.length} without websites, ${newCandidates.length} new`);

      // 4. Get full details for new candidates
      for (const place of newCandidates) {
        try {
          console.log(`    Getting details for: ${place.displayName?.text || place.id}...`);
          const details = await getPlaceDetails(place.id);
          const business = transformToBusinessRecord(details, search);
          allBusinesses.push(business);
        } catch (error) {
          console.error(`    Error getting details for ${place.id}:`, error);
        }
      }
    } catch (error) {
      console.error(`  Error processing search:`, error);
    }
  }

  console.log(`\n=== Writing ${allBusinesses.length} businesses to DynamoDB ===`);
  await writeToDynamoDB(allBusinesses);

  console.log('\n=== Task Complete ===');
  console.log(`Total businesses saved: ${allBusinesses.length}`);
}

main().catch(error => {
  console.error('Task failed:', error);
  process.exit(1);
});
