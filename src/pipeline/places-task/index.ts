import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

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

interface PlaceBasic {
  id: string;
  displayName: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
}

interface PlaceDetails extends PlaceBasic {
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

interface JobInput {
  businessTypes?: string[];
  states?: string[];
  countPerType?: number;
}

async function searchPlaces(query: string, maxResults = 20): Promise<PlaceBasic[]> {
  await rateLimiter.acquire();
  
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const fieldMask = 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.regularOpeningHours';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: maxResults }),
  });

  if (!response.ok) {
    throw new Error(`Places API search failed: ${response.status} - ${await response.text()}`);
  }

  const data = await response.json() as { places?: PlaceBasic[] };
  return data.places || [];
}

async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  await rateLimiter.acquire();
  
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  const fieldMask = 'id,displayName,formattedAddress,nationalPhoneNumber,rating,userRatingCount,regularOpeningHours,reviews,editorialSummary,photos,googleMapsUri,location,addressComponents';

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

async function findBusinessesWithoutWebsites(
  businessType: string,
  state: string,
  count: number
): Promise<Record<string, unknown>[]> {
  const seenPlaceIds = new Set<string>();
  const noWebsitePlaces: PlaceBasic[] = [];
  
  const searchVariations = [
    `${businessType} in ${state}`,
    `${businessType} near ${state}`,
    `${businessType} ${state}`,
  ];
  
  console.log(`Searching for ${count} ${businessType} without websites in ${state}...`);

  for (const query of searchVariations) {
    if (noWebsitePlaces.length >= count) break;

    console.log(`  Trying: "${query}"...`);
    
    try {
      const places = await searchPlaces(query, 20);
      console.log(`    Found ${places.length} results`);

      for (const place of places) {
        if (seenPlaceIds.has(place.id)) continue;
        seenPlaceIds.add(place.id);

        if (!place.websiteUri) {
          noWebsitePlaces.push(place);
          console.log(`    ✓ Found without website: ${place.displayName?.text}`);
          
          if (noWebsitePlaces.length >= count) break;
        }
      }
    } catch (error) {
      console.error(`    Error searching: ${error}`);
    }
  }

  console.log(`Found ${noWebsitePlaces.length} businesses without websites`);

  const businesses: Record<string, unknown>[] = [];

  for (const place of noWebsitePlaces.slice(0, count)) {
    try {
      console.log(`  Getting details for: ${place.displayName?.text}...`);
      const details = await getPlaceDetails(place.id);

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

      const business = {
        place_id: place.id,
        business_name: details.displayName?.text || 'Unknown',
        business_type: businessType,
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
        friendly_slug: `${(details.displayName?.text || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${place.id.slice(-8)}`,
        created_at: new Date().toISOString(),
        copy_generated: false,
      };

      businesses.push(business);
    } catch (error) {
      console.error(`  Error processing ${place.id}:`, error);
    }
  }

  return businesses;
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

async function main(): Promise<void> {
  console.log('=== Google Places Polling Task ===');
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

  const businessTypes = jobInput.businessTypes || ['plumbers', 'pet groomers', 'laundromats'];
  const states = jobInput.states || ['California', 'Texas', 'Florida'];
  const countPerType = jobInput.countPerType || 5;

  console.log(`Business types: ${businessTypes.join(', ')}`);
  console.log(`States: ${states.join(', ')}`);
  console.log(`Count per type: ${countPerType}`);

  const allBusinesses: Record<string, unknown>[] = [];

  for (const businessType of businessTypes) {
    for (const state of states) {
      console.log(`\n--- Processing ${businessType} in ${state} ---`);
      
      const businesses = await findBusinessesWithoutWebsites(businessType, state, countPerType);
      allBusinesses.push(...businesses);
      
      console.log(`Found ${businesses.length} businesses`);
    }
  }

  console.log(`\n=== Writing ${allBusinesses.length} businesses to DynamoDB ===`);
  await writeToDynamoDB(allBusinesses);

  console.log('\n=== Task Complete ===');
  console.log(`Total businesses added: ${allBusinesses.length}`);
}

main().catch(error => {
  console.error('Task failed:', error);
  process.exit(1);
});

