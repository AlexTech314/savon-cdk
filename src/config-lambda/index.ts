import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  GetCommand, 
  PutCommand, 
  DeleteCommand,
  BatchWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import Anthropic from '@anthropic-ai/sdk';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
const TABLE_NAME = process.env.BUSINESSES_TABLE_NAME!;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

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

function hasActiveApiKeys(): boolean {
  return activeKeys.length > 0;
}

// Sync version for photo URLs (don't need rate limiting, just distribution)
let photoUrlKeyIndex = 0;
function getNextApiKeySync(): string {
  const key = activeKeys[photoUrlKeyIndex % activeKeys.length];
  const keyName = activeKeyNames[photoUrlKeyIndex % activeKeyNames.length];
  photoUrlKeyIndex++;
  console.log(`[Photo URL] Using key: ${keyName}`);
  return key;
}

interface Business {
  place_id: string;
  business_name: string;
  business_type: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone?: string;
  friendly_slug?: string;
  [key: string]: unknown;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { routeKey, pathParameters, queryStringParameters, body } = event;
  
  try {
    // GET /businesses - List with pagination
    if (routeKey === 'GET /businesses') {
      return await listBusinesses(queryStringParameters);
    }
    
    // GET /businesses/{place_id} - Get single record
    if (routeKey === 'GET /businesses/{place_id}') {
      return await getBusiness(pathParameters?.place_id!);
    }
    
    // GET /businesses/slug/{slug} - Get by friendly slug
    if (routeKey === 'GET /businesses/slug/{slug}') {
      return await getBusinessBySlug(pathParameters?.slug!);
    }
    
    // PUT /businesses/{place_id} - Update record
    if (routeKey === 'PUT /businesses/{place_id}') {
      return await updateBusiness(pathParameters?.place_id!, body);
    }
    
    // DELETE /businesses/{place_id} - Delete record
    if (routeKey === 'DELETE /businesses/{place_id}') {
      return await deleteBusiness(pathParameters?.place_id!);
    }
    
    // POST /businesses/import - CSV import
    if (routeKey === 'POST /businesses/import') {
      return await importBusinesses(body);
    }
    
    // GET /businesses/export - CSV export
    if (routeKey === 'GET /businesses/export') {
      return await exportBusinesses(queryStringParameters);
    }
    
    // GET /businesses/columns - Get available column names
    if (routeKey === 'GET /businesses/columns') {
      return await getBusinessColumns();
    }
    
    // GET /businesses/filters - Get available filter options (types, states)
    if (routeKey === 'GET /businesses/filters') {
      return await getBusinessFilterOptions();
    }

    // POST /businesses/count - Count businesses matching filter rules
    if (routeKey === 'POST /businesses/count') {
      return await countBusinesses(body);
    }
    
    // POST /businesses/{place_id}/generate-copy - Generate preview copy for a business
    if (routeKey === 'POST /businesses/{place_id}/generate-copy') {
      return await generateCopy(pathParameters?.place_id!);
    }
    
    // POST /businesses/{place_id}/generate-details - Fetch details from Google Places API
    if (routeKey === 'POST /businesses/{place_id}/generate-details') {
      return await generateDetails(pathParameters?.place_id!);
    }
    
    // POST /businesses/{place_id}/generate-reviews - Fetch reviews from Google Places API
    if (routeKey === 'POST /businesses/{place_id}/generate-reviews') {
      return await generateReviews(pathParameters?.place_id!);
    }
    
    // POST /businesses/{place_id}/generate-photos - Fetch photos from Google Places API
    if (routeKey === 'POST /businesses/{place_id}/generate-photos') {
      return await generatePhotos(pathParameters?.place_id!);
    }
    
    // GET /preview/{place_id} - On-demand preview generation (unauthenticated)
    if (routeKey === 'GET /preview/{place_id}') {
      return await getPreview(pathParameters?.place_id!);
    }
    
    return response(404, { error: 'Not found' });
  } catch (error) {
    console.error('Error:', error);
    return response(500, { error: 'Internal server error', details: String(error) });
  }
}

async function listBusinesses(
  queryParams?: Record<string, string | undefined>
): Promise<APIGatewayProxyResultV2> {
  const limit = parseInt(queryParams?.limit || '50', 10);
  const page = parseInt(queryParams?.page || '1', 10);
  const searchTerm = queryParams?.q?.toLowerCase();
  
  // Filter parameters
  const businessTypeFilter = queryParams?.business_type;
  const stateFilter = queryParams?.state;
  const pipelineStatusFilter = queryParams?.pipeline_status;
  const hasWebsiteFilter = queryParams?.has_website;
  
  // Check if any filters are active
  const hasFilters = searchTerm || businessTypeFilter || stateFilter || pipelineStatusFilter || hasWebsiteFilter;

  // Scan all items (we need to scan all to apply filters properly)
  const allItems: Record<string, unknown>[] = [];
  let scanLastKey: Record<string, unknown> | undefined;
  
  do {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: scanLastKey,
    });
    
    const result = await docClient.send(command);
    allItems.push(...(result.Items || []));
    scanLastKey = result.LastEvaluatedKey;
  } while (scanLastKey);
  
  let items = allItems;
  
  // Apply search filter if provided
  if (searchTerm) {
    items = items.filter(item => {
      const searchableFields = ['business_name', 'city', 'state', 'business_type', 'address'];
      return searchableFields.some(field => 
        String(item[field] || '').toLowerCase().includes(searchTerm)
      );
    });
  }
  
  // Apply business type filter
  if (businessTypeFilter) {
    items = items.filter(item => 
      String(item.business_type || '').toLowerCase() === businessTypeFilter.toLowerCase()
    );
  }
  
  // Apply state filter
  if (stateFilter) {
    items = items.filter(item => 
      String(item.state || '').toUpperCase() === stateFilter.toUpperCase()
    );
  }
  
  // Apply pipeline status filter
  if (pipelineStatusFilter) {
    items = items.filter(item => {
      switch (pipelineStatusFilter) {
        case 'searched':
          return item.searched && !item.details_fetched;
        case 'details':
          return item.details_fetched && !item.reviews_fetched;
        case 'reviews':
          return item.reviews_fetched && !item.copy_generated;
        case 'photos':
          return item.photos_fetched;
        case 'copy':
        case 'complete':
          return item.copy_generated;
        case 'has_website':
          return item.has_website;
        default:
          return true;
      }
    });
  }
  
  // Apply has_website filter
  if (hasWebsiteFilter !== undefined) {
    const hasWebsite = hasWebsiteFilter === 'true';
    items = items.filter(item => hasWebsite ? item.has_website : !item.has_website);
  }
  
  // Get filtered count for pagination
  const filteredCount = items.length;
  
  // Calculate offset for page-based pagination
  const offset = (page - 1) * limit;
  
  // Apply pagination
  const paginatedItems = items.slice(offset, offset + limit);
  
  return response(200, {
    items: paginatedItems,
    count: filteredCount,
    page,
    limit,
  });
}

async function getBusiness(placeId: string): Promise<APIGatewayProxyResultV2> {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
  });
  
  const result = await docClient.send(command);
  
  if (!result.Item) {
    return response(404, { error: 'Business not found' });
  }
  
  return response(200, result.Item);
}

async function getBusinessBySlug(slug: string): Promise<APIGatewayProxyResultV2> {
  // Query the GSI by-slug
  const command = new ScanCommand({
    TableName: TABLE_NAME,
    IndexName: 'by-slug',
    FilterExpression: 'friendly_slug = :slug',
    ExpressionAttributeValues: {
      ':slug': slug,
    },
    Limit: 1,
  });
  
  const result = await docClient.send(command);
  
  if (!result.Items || result.Items.length === 0) {
    return response(404, { error: 'Business not found' });
  }
  
  return response(200, result.Items[0]);
}

async function updateBusiness(placeId: string, body?: string): Promise<APIGatewayProxyResultV2> {
  if (!body) {
    return response(400, { error: 'Request body required' });
  }
  
  const updates = JSON.parse(body) as Partial<Business>;
  
  // Get existing item first
  const existing = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
  }));
  
  if (!existing.Item) {
    return response(404, { error: 'Business not found' });
  }
  
  // Merge updates
  const updated = {
    ...existing.Item,
    ...updates,
    place_id: placeId, // Ensure place_id isn't changed
    updated_at: new Date().toISOString(),
  };
  
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: updated,
  }));
  
  return response(200, updated);
}

async function deleteBusiness(placeId: string): Promise<APIGatewayProxyResultV2> {
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
  }));
  
  return response(200, { success: true, deleted: placeId });
}

async function importBusinesses(body?: string): Promise<APIGatewayProxyResultV2> {
  if (!body) {
    return response(400, { error: 'CSV body required' });
  }
  
  // Parse CSV
  const records = parse(body, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Business[];
  
  if (records.length === 0) {
    return response(400, { error: 'No records found in CSV' });
  }
  
  // Validate place_id exists
  const invalidRecords = records.filter(r => !r.place_id);
  if (invalidRecords.length > 0) {
    return response(400, { error: 'All records must have a place_id' });
  }
  
  // Batch write (25 items at a time - DynamoDB limit)
  const batches = [];
  for (let i = 0; i < records.length; i += 25) {
    const batch = records.slice(i, i + 25);
    const command = new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: batch.map(item => ({
          PutRequest: {
            Item: {
              ...item,
              imported_at: new Date().toISOString(),
            },
          },
        })),
      },
    });
    batches.push(docClient.send(command));
  }
  
  await Promise.all(batches);
  
  return response(200, { 
    success: true, 
    imported: records.length,
    message: `Imported ${records.length} records`,
  });
}

async function exportBusinesses(
  queryParams?: Record<string, string | undefined>
): Promise<APIGatewayProxyResultV2> {
  // Parse selected columns from query params (comma-separated)
  const selectedColumns = queryParams?.columns?.split(',').filter(c => c.trim()) || [];
  
  // Scan all items (for small datasets; paginate for larger)
  const items: Business[] = [];
  let lastKey: Record<string, unknown> | undefined;
  
  do {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: lastKey,
    });
    
    const result = await docClient.send(command);
    items.push(...(result.Items as Business[] || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  if (items.length === 0) {
    return response(200, '', { 'Content-Type': 'text/csv' });
  }
  
  // Get all unique columns from data
  const allColumns = [...new Set(items.flatMap(item => Object.keys(item)))];
  
  // Use selected columns if provided, otherwise all columns
  const columns = selectedColumns.length > 0 
    ? selectedColumns.filter(c => allColumns.includes(c))
    : allColumns;
  
  const csv = stringify(items, {
    header: true,
    columns,
  });
  
  return response(200, csv, { 
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="businesses_${Date.now()}.csv"`,
  });
}

/**
 * Get all available column names from business records
 * Used for export column selection
 */
async function getBusinessColumns(): Promise<APIGatewayProxyResultV2> {
  // Scan items to discover all column names
  const columnSet = new Set<string>();
  let lastKey: Record<string, unknown> | undefined;
  let scannedCount = 0;
  const MAX_SCAN = 1000; // Scan up to 1000 items to discover columns
  
  do {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: lastKey,
      Limit: 100,
    });
    
    const result = await docClient.send(command);
    
    for (const item of (result.Items || [])) {
      Object.keys(item).forEach(key => columnSet.add(key));
    }
    
    scannedCount += result.Items?.length || 0;
    lastKey = result.LastEvaluatedKey;
  } while (lastKey && scannedCount < MAX_SCAN);
  
  // Convert to array and sort alphabetically, with common columns first
  const priorityColumns = [
    'place_id', 'business_name', 'business_type', 
    'address', 'city', 'state', 'zip_code', 'phone',
    'website_uri', 'rating', 'rating_count',
    'created_at', 'updated_at'
  ];
  
  const allColumns = [...columnSet];
  
  // Sort: priority columns first (in order), then rest alphabetically
  const sortedColumns = [
    ...priorityColumns.filter(c => columnSet.has(c)),
    ...allColumns.filter(c => !priorityColumns.includes(c)).sort(),
  ];
  
  return response(200, {
    columns: sortedColumns,
    total: sortedColumns.length,
  });
}

/**
 * Get available filter options (unique business types and states)
 * Used for populating filter dropdowns
 */
async function getBusinessFilterOptions(): Promise<APIGatewayProxyResultV2> {
  const businessTypes = new Set<string>();
  const states = new Set<string>();
  let lastKey: Record<string, unknown> | undefined;

  do {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: lastKey,
      ProjectionExpression: 'business_type, #state',
      ExpressionAttributeNames: { '#state': 'state' },
    });

    const result = await docClient.send(command);

    for (const item of (result.Items || [])) {
      if (item.business_type && typeof item.business_type === 'string') {
        businessTypes.add(item.business_type);
      }
      if (item.state && typeof item.state === 'string') {
        states.add(item.state.toUpperCase());
      }
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return response(200, {
    businessTypes: [...businessTypes].sort(),
    states: [...states].sort(),
  });
}

/**
 * Count businesses matching filter rules
 * Used for pipeline cost estimation
 */
interface FilterRule {
  field: string;
  operator: 'EXISTS' | 'NOT_EXISTS' | 'EQUALS' | 'NOT_EQUALS';
  value?: string;
}

interface CountRequest {
  filterRules?: FilterRule[];
  skipWithWebsite?: boolean;
  // Which pipeline steps are selected (to check which steps are already complete)
  runDetails?: boolean;
  runEnrich?: boolean;
  runPhotos?: boolean;
  runCopy?: boolean;
}

async function countBusinesses(body?: string): Promise<APIGatewayProxyResultV2> {
  const request: CountRequest = body ? JSON.parse(body) : {};
  const { filterRules = [], skipWithWebsite = true, runDetails, runEnrich, runPhotos, runCopy } = request;
  
  // Scan all items and apply filters
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  
  do {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: lastKey,
    });
    
    const result = await docClient.send(command);
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  // Apply filter rules
  let filtered = items;
  
  // Skip businesses with website if enabled
  if (skipWithWebsite) {
    filtered = filtered.filter(item => !item.has_website);
  }
  
  // Apply custom filter rules (all must match - AND logic)
  for (const rule of filterRules) {
    filtered = filtered.filter(item => {
      const fieldValue = item[rule.field];
      
      switch (rule.operator) {
        case 'EXISTS':
          return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
        case 'NOT_EXISTS':
          return fieldValue === undefined || fieldValue === null || fieldValue === '';
        case 'EQUALS':
          return String(fieldValue).toLowerCase() === String(rule.value || '').toLowerCase();
        case 'NOT_EQUALS':
          return String(fieldValue).toLowerCase() !== String(rule.value || '').toLowerCase();
        default:
          return true;
      }
    });
  }
  
  // Further filter: skip businesses that have already completed all requested steps
  // (i.e., we only want to count businesses that will actually be processed)
  if (runDetails || runEnrich || runPhotos || runCopy) {
    filtered = filtered.filter(item => {
      // A business needs processing if at least one selected step hasn't been done yet
      if (runDetails && !item.details_fetched) return true;
      if (runEnrich && !item.reviews_fetched) return true;
      if (runPhotos && !item.photos_fetched) return true;
      if (runCopy && !item.copy_generated) return true;
      // All selected steps already done - skip this business
      return false;
    });
  }
  
  // Calculate per-step breakdown
  const stepCounts = {
    total: filtered.length,
    details: runDetails ? filtered.filter(b => !b.details_fetched).length : 0,
    reviews: runEnrich ? filtered.filter(b => !b.reviews_fetched).length : 0,
    photos: runPhotos ? filtered.filter(b => !b.photos_fetched).length : 0,
    copy: runCopy ? filtered.filter(b => !b.copy_generated).length : 0,
  };
  
  return response(200, {
    count: filtered.length,
    stepCounts,
    totalInDatabase: items.length,
    message: `${filtered.length} businesses match the filter rules and need processing`,
  });
}

function response(
  statusCode: number, 
  body: unknown, 
  additionalHeaders: Record<string, string> = {}
): APIGatewayProxyResultV2 {
  const isString = typeof body === 'string';
  
  return {
    statusCode,
    headers: {
      'Content-Type': isString ? 'text/plain' : 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
      ...additionalHeaders,
    },
    body: isString ? body : JSON.stringify(body),
  };
}

// ============================================
// GENERATE COPY (LLM Preview Generation)
// ============================================

interface LandingPageCopy {
  hero: {
    headline: string;
    subheadline: string;
    primaryCtaText: string;
    secondaryCtaText: string;
    trustBadges: string[];
  };
  servicesSection: {
    tagline: string;
    headline: string;
    subheadline: string;
    services: Array<{ icon: string; title: string; description: string }>;
  };
  whyChooseUs: {
    tagline: string;
    headline: string;
    benefits: Array<{ icon: string; title: string; description: string }>;
  };
  serviceArea: {
    headline: string;
    hoursHeadline: string;
    hoursSubtext: string;
    phoneHeadline: string;
  };
  emergencyCta: {
    headline: string;
    subheadline: string;
    ctaText: string;
  };
  contactSection: {
    tagline: string;
    trustBadges: string[];
    servingNote: string;
  };
  seo: {
    title: string;
    description: string;
    keywords: string;
    schemaType: string;
  };
  theme: {
    primary: string;
    primaryDark: string;
    accent: string;
    accentHover: string;
  };
}

const SYSTEM_PROMPT = `You are an expert copywriter specializing in local service business marketing. Your task is to generate compelling, SEO-optimized copy for a landing page that converts visitors into customers.

The Goal: Create copy that:
1. Builds immediate trust and credibility
2. Clearly communicates the value proposition
3. Drives phone calls and inquiries
4. Ranks well for local SEO
5. Feels professional yet approachable

Output ONLY a valid JSON object with the exact structure specified. No markdown, no explanations, no preamble.`;

function buildUserPrompt(business: Business): string {
  const zipMatch = business.address?.match(/\b(\d{5}(?:-\d{4})?)\b/);
  const zip = zipMatch ? zipMatch[1] : '';
  
  let reviews: Array<{ text: string; author: string; rating: number }> = [];
  try {
    const parsedReviews = JSON.parse((business as Record<string, unknown>).reviews as string || '[]');
    reviews = parsedReviews.map((r: { text?: string; authorDisplayName?: string; rating?: number }) => ({
      text: r.text || '',
      author: r.authorDisplayName || 'Anonymous',
      rating: r.rating || 5
    }));
  } catch {
    reviews = [];
  }
  
  const businessData = {
    business_name: business.business_name,
    business_type: business.business_type,
    phone: business.phone || '',
    address: business.address,
    city: business.city,
    state: business.state,
    zip,
    rating: (business as Record<string, unknown>).rating || null,
    rating_count: (business as Record<string, unknown>).rating_count || null,
    hours: (business as Record<string, unknown>).hours || '',
    reviews,
    google_maps_uri: (business as Record<string, unknown>).google_maps_uri || '',
    primary_type: business.business_type
  };

  return `Using the business data below, generate landing page copy following this exact JSON structure:

{
  "hero": {
    "headline": "8-12 words, benefit-focused, include city if possible",
    "subheadline": "12-20 words, address customer pain point",
    "primaryCtaText": "4-6 words with phone number, e.g. 'Call Now (555) 123-4567'",
    "secondaryCtaText": "2-4 words, e.g. 'Get Free Quote'",
    "trustBadges": ["3 trust signals, 2-4 words each"]
  },
  "servicesSection": {
    "tagline": "2-3 words, e.g. 'WHAT WE OFFER'",
    "headline": "4-8 words, benefit-oriented",
    "subheadline": "15-25 words describing service range",
    "services": [
      {"icon": "LucideIconName", "title": "2-4 words", "description": "20-30 words"}
    ]
  },
  "whyChooseUs": {
    "tagline": "2-3 words",
    "headline": "5-10 words positioning as trusted choice",
    "benefits": [
      {"icon": "LucideIconName", "title": "2-5 words", "description": "15-25 words"}
    ]
  },
  "serviceArea": {
    "headline": "5-10 words emphasizing local area",
    "hoursHeadline": "2-5 words label for hours",
    "hoursSubtext": "8-15 words about availability",
    "phoneHeadline": "2-4 words above phone"
  },
  "emergencyCta": {
    "headline": "3-6 words, urgent",
    "subheadline": "15-25 words reassuring help is available",
    "ctaText": "4-8 words with phone number"
  },
  "contactSection": {
    "tagline": "2-3 words",
    "trustBadges": ["5 trust signals, 3-6 words each"],
    "servingNote": "15-25 words geographic statement"
  },
  "seo": {
    "title": "50-60 chars for browser/search",
    "description": "150-160 chars meta description with phone",
    "keywords": "10-15 comma-separated keywords",
    "schemaType": "Plumber|Accountant|Chiropractor|HVACBusiness|Electrician|LocalBusiness"
  },
  "theme": {
    "primary": "HSL without hsl(), e.g. '224 64% 33%'",
    "primaryDark": "darker variant",
    "accent": "CTA color contrasting with primary",
    "accentHover": "darker accent for hover"
  }
}

Available icons: Wrench, Droplets, Flame, Settings, Shield, Clock, Zap, Award, DollarSign, ThumbsUp, Building, Calculator, FileText, TrendingUp, Briefcase, Users, Lock, Heart, Star, MapPin, Thermometer, Wind, Home, CreditCard, CheckCircle, Leaf, Sparkles, Trash2, Warehouse, Headphones, Server, Cloud, Database, Network, Activity, HeartPulse, Baby, Dumbbell

Color guidelines by business type:
- Plumbers: Blue primary, Orange accent (trustworthy, urgent)
- Accountants/Tax: Green primary, Gold accent (professional, prosperous)
- HVAC: Blue primary, Red accent (reliable, temperature)
- Chiropractors: Teal primary, Coral accent (wellness, healing)
- Electricians: Yellow primary, Navy accent (energy, safety)
- Commercial Cleaning: Cyan primary, Green accent (clean, fresh)
- IT Support: Purple primary, Cyan accent (tech, modern)

Business Data:
${JSON.stringify(businessData, null, 2)}

Generate 6 services and 6 benefits relevant to this business type. Return ONLY the JSON object.`;
}

function flattenCopy(copy: LandingPageCopy): Record<string, string> {
  return {
    copy_hero_headline: copy.hero.headline,
    copy_hero_subheadline: copy.hero.subheadline,
    copy_hero_primary_cta: copy.hero.primaryCtaText,
    copy_hero_secondary_cta: copy.hero.secondaryCtaText,
    copy_hero_trust_badges: copy.hero.trustBadges.join(' | '),
    copy_services_tagline: copy.servicesSection.tagline,
    copy_services_headline: copy.servicesSection.headline,
    copy_services_subheadline: copy.servicesSection.subheadline,
    copy_services_items: JSON.stringify(copy.servicesSection.services),
    copy_why_tagline: copy.whyChooseUs.tagline,
    copy_why_headline: copy.whyChooseUs.headline,
    copy_why_benefits: JSON.stringify(copy.whyChooseUs.benefits),
    copy_area_headline: copy.serviceArea.headline,
    copy_area_hours_headline: copy.serviceArea.hoursHeadline,
    copy_area_hours_subtext: copy.serviceArea.hoursSubtext,
    copy_area_phone_headline: copy.serviceArea.phoneHeadline,
    copy_emergency_headline: copy.emergencyCta.headline,
    copy_emergency_subheadline: copy.emergencyCta.subheadline,
    copy_emergency_cta: copy.emergencyCta.ctaText,
    copy_contact_tagline: copy.contactSection.tagline,
    copy_contact_trust_badges: copy.contactSection.trustBadges.join(' | '),
    copy_contact_serving_note: copy.contactSection.servingNote,
    copy_seo_title: copy.seo.title,
    copy_seo_description: copy.seo.description,
    copy_seo_keywords: copy.seo.keywords,
    copy_seo_schema_type: copy.seo.schemaType,
    copy_theme_primary: copy.theme.primary,
    copy_theme_primary_dark: copy.theme.primaryDark,
    copy_theme_accent: copy.theme.accent,
    copy_theme_accent_hover: copy.theme.accentHover,
  };
}

async function generateCopy(placeId: string): Promise<APIGatewayProxyResultV2> {
  if (!CLAUDE_API_KEY) {
    return response(500, { error: 'Claude API key not configured' });
  }

  // Get the business
  const getCommand = new GetCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
  });
  
  const result = await docClient.send(getCommand);
  
  if (!result.Item) {
    return response(404, { error: 'Business not found' });
  }
  
  const business = result.Item as Business;
  const businessRecord = business as Record<string, unknown>;
  
  // SMART: Skip if copy already generated
  if (businessRecord.copy_generated === true) {
    console.log(`Copy already generated for: ${business.business_name} - skipping LLM call`);
    return response(200, { 
      ...business, 
      skipped: true, 
      reason: 'Copy already generated' 
    });
  }
  
  console.log(`Generating copy for: ${business.business_name}`);
  
  // Initialize Anthropic client
  const anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY });
  
  // Call Claude API
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: buildUserPrompt(business),
      },
    ],
    system: SYSTEM_PROMPT,
  });
  
  // Extract text content
  const textContent = message.content.find(block => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return response(500, { error: 'No text response from Claude' });
  }
  
  // Parse the JSON response
  let copy: LandingPageCopy;
  try {
    copy = JSON.parse(textContent.text) as LandingPageCopy;
  } catch (e) {
    console.error('Failed to parse Claude response:', textContent.text);
    return response(500, { error: 'Failed to parse LLM response', details: String(e) });
  }
  
  // Flatten the copy and update the business
  const flatCopy = flattenCopy(copy);
  
  // Build update expression
  const updateParts: string[] = ['#copy_generated = :true', '#updated_at = :now'];
  const expressionNames: Record<string, string> = {
    '#copy_generated': 'copy_generated',
    '#updated_at': 'updated_at',
  };
  const expressionValues: Record<string, unknown> = {
    ':true': true,
    ':now': new Date().toISOString(),
  };
  
  Object.entries(flatCopy).forEach(([key, value], index) => {
    updateParts.push(`#attr${index} = :val${index}`);
    expressionNames[`#attr${index}`] = key;
    expressionValues[`:val${index}`] = value;
  });
  
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
  }));
  
  console.log(`Copy generated successfully for: ${business.business_name}`);
  
  // Return the updated business
  const updatedResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
  }));
  
  return response(200, updatedResult.Item);
}

// ============================================
// GOOGLE PLACES API FUNCTIONS
// ============================================

interface PlaceDetails {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  googleMapsUri?: string;
  location?: { latitude: number; longitude: number };
  addressComponents?: Array<{ longText: string; shortText: string; types: string[] }>;
  primaryType?: string;
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

interface PlacePhotos {
  photos?: Array<{ name: string }>;
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

function formatAuthorDisplayName(fullName: string): string {
  if (!fullName) return 'Anonymous';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function buildPhotoUrl(photoName: string, maxWidth = 800): string {
  return `https://places.googleapis.com/v1/${photoName}/media?key=${getNextApiKeySync()}&maxWidthPx=${maxWidth}`;
}

/**
 * POST /businesses/{place_id}/generate-details
 * Fetches business details from Google Places API (Enterprise tier: $20/1000)
 * SMART: Skips if details are already fetched (no double-dipping)
 */
async function generateDetails(placeId: string): Promise<APIGatewayProxyResultV2> {
  if (!hasActiveApiKeys()) {
    return response(500, { error: 'Google API key not configured' });
  }

  // Get the business to verify it exists
  const getCommand = new GetCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
  });
  
  const result = await docClient.send(getCommand);
  
  if (!result.Item) {
    return response(404, { error: 'Business not found' });
  }

  const business = result.Item as Business;
  const businessRecord = business as Record<string, unknown>;
  
  // SMART: Skip if details already fetched (from tiered search or previous call)
  if (businessRecord.details_fetched === true) {
    console.log(`Details already fetched for: ${business.business_name} - skipping API call`);
    return response(200, { 
      ...business, 
      skipped: true, 
      reason: 'Details already fetched' 
    });
  }
  
  console.log(`Fetching details for: ${business.business_name}`);

  // Call Google Places API
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  const fieldMask = [
    'id',
    'displayName',
    'formattedAddress',
    'addressComponents',
    'nationalPhoneNumber',
    'rating',
    'userRatingCount',
    'regularOpeningHours',
    'websiteUri',
    'googleMapsUri',
    'location',
    'primaryType',
  ].join(',');

  // Get next available key (waits if rate limited)
  const apiKey = await getNextApiKey();

  const apiResponse = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
  });

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    console.error(`Places API failed: ${apiResponse.status} - ${errorText}`);
    return response(500, { error: 'Google Places API failed', details: errorText });
  }

  const details = await apiResponse.json() as PlaceDetails;

  // Extract address components
  const streetNumber = extractAddressComponent(details.addressComponents, 'street_number');
  const route = extractAddressComponent(details.addressComponents, 'route');
  const state = extractAddressComponent(details.addressComponents, 'administrative_area_level_1');
  const hasWebsite = !!details.websiteUri;

  // Build update expression
  const updateFields: Record<string, unknown> = {
    address: details.formattedAddress || '',
    city: extractCity(details.formattedAddress || ''),
    state: state,
    street: [streetNumber, route].filter(Boolean).join(' '),
    zip_code: extractAddressComponent(details.addressComponents, 'postal_code'),
    phone: details.nationalPhoneNumber || '',
    rating: details.rating || null,
    rating_count: details.userRatingCount || null,
    hours: details.regularOpeningHours?.weekdayDescriptions?.join('; ') || '',
    google_maps_uri: details.googleMapsUri || '',
    latitude: details.location?.latitude || null,
    longitude: details.location?.longitude || null,
    website_uri: details.websiteUri || null,
    primary_type: details.primaryType || null,
    business_name: details.displayName?.text || business.business_name,
    friendly_slug: `${(details.displayName?.text || business.business_name || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${placeId.slice(-8)}`,
    details_fetched: true,
    has_website: hasWebsite,
    details_fetched_at: new Date().toISOString(),
  };

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
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
  }));

  console.log(`Details fetched successfully for: ${business.business_name}`);

  // Return the updated business
  const updatedResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
  }));

  return response(200, updatedResult.Item);
}

/**
 * POST /businesses/{place_id}/generate-reviews
 * Fetches reviews from Google Places API (Enterprise+Atmosphere tier: $25/1000)
 * SMART: Skips if reviews are already fetched (no double-dipping)
 */
async function generateReviews(placeId: string): Promise<APIGatewayProxyResultV2> {
  if (!hasActiveApiKeys()) {
    return response(500, { error: 'Google API key not configured' });
  }

  // Get the business to verify it exists
  const getCommand = new GetCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
  });
  
  const result = await docClient.send(getCommand);
  
  if (!result.Item) {
    return response(404, { error: 'Business not found' });
  }

  const business = result.Item as Business;
  const businessRecord = business as Record<string, unknown>;
  
  // SMART: Skip if reviews already fetched (from tiered search or previous call)
  if (businessRecord.reviews_fetched === true) {
    console.log(`Reviews already fetched for: ${business.business_name} - skipping API call`);
    return response(200, { 
      ...business, 
      skipped: true, 
      reason: 'Reviews already fetched' 
    });
  }
  
  console.log(`Fetching reviews for: ${business.business_name}`);

  // Call Google Places API
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  const fieldMask = 'reviews,editorialSummary';

  // Get next available key (waits if rate limited)
  const apiKey = await getNextApiKey();

  const apiResponse = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
  });

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    console.error(`Places API failed: ${apiResponse.status} - ${errorText}`);
    return response(500, { error: 'Google Places API failed', details: errorText });
  }

  const enrichment = await apiResponse.json() as PlaceEnrichment;

  // Transform reviews
  const reviews = (enrichment.reviews || [])
    .slice(0, 5)
    .filter(r => r.text?.text)
    .map(r => ({
      text: r.text?.text || '',
      authorName: r.authorAttribution?.displayName || 'Anonymous',
      authorDisplayName: formatAuthorDisplayName(r.authorAttribution?.displayName || ''),
      authorUri: r.authorAttribution?.uri || '',
      rating: r.rating,
      relativeTime: r.relativePublishTimeDescription,
    }));

  // Build update expression
  const updateFields: Record<string, unknown> = {
    reviews: JSON.stringify(reviews),
    editorial_summary: enrichment.editorialSummary?.text || '',
    review_count: reviews.length,
    reviews_fetched: true,
    reviews_fetched_at: new Date().toISOString(),
  };

  const updateParts: string[] = [];
  const expressionNames: Record<string, string> = {};
  const expressionValues: Record<string, unknown> = {};

  Object.entries(updateFields).forEach(([key, value], index) => {
    updateParts.push(`#attr${index} = :val${index}`);
    expressionNames[`#attr${index}`] = key;
    expressionValues[`:val${index}`] = value;
  });

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
  }));

  console.log(`Reviews fetched successfully for: ${business.business_name} (${reviews.length} reviews)`);

  // Return the updated business
  const updatedResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
  }));

  return response(200, updatedResult.Item);
}

/**
 * POST /businesses/{place_id}/generate-photos
 * Fetches photos from Google Places API ($7/1000)
 * SMART: Skips if photos are already fetched (no double-dipping)
 */
async function generatePhotos(placeId: string): Promise<APIGatewayProxyResultV2> {
  if (!hasActiveApiKeys()) {
    return response(500, { error: 'Google API key not configured' });
  }

  // Get the business to verify it exists
  const getCommand = new GetCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
  });
  
  const result = await docClient.send(getCommand);
  
  if (!result.Item) {
    return response(404, { error: 'Business not found' });
  }

  const business = result.Item as Business;
  const businessRecord = business as Record<string, unknown>;
  
  // SMART: Skip if photos already fetched
  if (businessRecord.photos_fetched === true) {
    console.log(`Photos already fetched for: ${business.business_name} - skipping API call`);
    return response(200, { 
      ...business, 
      skipped: true, 
      reason: 'Photos already fetched' 
    });
  }
  
  console.log(`Fetching photos for: ${business.business_name}`);

  // Call Google Places API
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  const fieldMask = 'photos';

  // Get next available key (waits if rate limited)
  const apiKey = await getNextApiKey();

  const apiResponse = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
  });

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    console.error(`Places API failed: ${apiResponse.status} - ${errorText}`);
    return response(500, { error: 'Google Places API failed', details: errorText });
  }

  const photos = await apiResponse.json() as PlacePhotos;

  // Build photo URLs (max 5 photos)
  const photoUrls = (photos.photos || [])
    .slice(0, 5)
    .map(photo => buildPhotoUrl(photo.name));

  // Build update expression
  const updateFields: Record<string, unknown> = {
    photo_urls: JSON.stringify(photoUrls),
    photo_count: photoUrls.length,
    photos_fetched: true,
    photos_fetched_at: new Date().toISOString(),
  };

  const updateParts: string[] = [];
  const expressionNames: Record<string, string> = {};
  const expressionValues: Record<string, unknown> = {};

  Object.entries(updateFields).forEach(([key, value], index) => {
    updateParts.push(`#attr${index} = :val${index}`);
    expressionNames[`#attr${index}`] = key;
    expressionValues[`:val${index}`] = value;
  });

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
  }));

  console.log(`Photos fetched successfully for: ${business.business_name} (${photoUrls.length} photos)`);

  // Return the updated business
  const updatedResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
  }));

  return response(200, updatedResult.Item);
}

// ============================================
// ON-DEMAND PREVIEW GENERATION
// ============================================

/**
 * GET /preview/{place_id}
 * On-demand preview generation - unauthenticated endpoint for preview UI
 * Speed-optimized: parallel Google API calls, synchronous generation
 */
async function getPreview(placeIdOrSlug: string): Promise<APIGatewayProxyResultV2> {
  console.log(`Preview requested for: ${placeIdOrSlug}`);
  
  // 1. Try to find business by slug first, then by place_id
  let business: Business | null = null;
  
  // Try slug lookup first
  const slugResult = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    IndexName: 'by-slug',
    FilterExpression: 'friendly_slug = :slug',
    ExpressionAttributeValues: { ':slug': placeIdOrSlug },
    Limit: 1,
  }));
  
  if (slugResult.Items && slugResult.Items.length > 0) {
    business = slugResult.Items[0] as Business;
  } else {
    // Try place_id lookup
    const placeIdResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { place_id: placeIdOrSlug },
    }));
    
    if (placeIdResult.Item) {
      business = placeIdResult.Item as Business;
    }
  }
  
  if (!business) {
    return response(404, { error: 'Business not found' });
  }
  
  console.log(`Found business: ${business.business_name}`);
  
  // 2. FAST PATH: If pipeline is complete, return immediately
  const businessRecord = business as Record<string, unknown>;
  if (businessRecord.copy_generated === true) {
    console.log(`Pipeline already complete for: ${business.business_name}`);
    return response(200, business);
  }
  
  // 3. SLOW PATH: Generate missing steps synchronously
  console.log(`Starting on-demand generation for: ${business.business_name}`);
  const startTime = Date.now();
  
  try {
    // Run details + reviews in PARALLEL for speed
    const needsDetails = !businessRecord.details_fetched;
    const needsReviews = !businessRecord.reviews_fetched;
    
    if (needsDetails || needsReviews) {
      console.log(`Fetching in parallel: details=${needsDetails}, reviews=${needsReviews}`);
      
      await Promise.all([
        needsDetails ? fetchDetailsInternal(business.place_id) : Promise.resolve(),
        needsReviews ? fetchReviewsInternal(business.place_id) : Promise.resolve(),
      ]);
    }
    
    // Generate LLM copy if needed (slowest step)
    const refreshedBusiness = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { place_id: business.place_id },
    }));
    
    if (!refreshedBusiness.Item || (refreshedBusiness.Item as Record<string, unknown>).copy_generated !== true) {
      console.log(`Generating LLM copy for: ${business.business_name}`);
      await generateCopyInternal(business.place_id);
    }
    
    // Return the fully updated business
    const finalResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { place_id: business.place_id },
    }));
    
    const elapsed = Date.now() - startTime;
    console.log(`On-demand generation complete for ${business.business_name} in ${elapsed}ms`);
    
    return response(200, finalResult.Item);
  } catch (error) {
    console.error(`On-demand generation failed for ${business.business_name}:`, error);
    return response(500, { 
      error: 'Failed to generate preview', 
      details: String(error),
      partial: business  // Return partial data so UI can show something
    });
  }
}

/**
 * Internal version of generateDetails for on-demand preview
 * Returns void, updates DynamoDB directly
 * SMART: Skips if details already fetched
 */
async function fetchDetailsInternal(placeId: string): Promise<void> {
  if (!hasActiveApiKeys()) {
    throw new Error('Google API key not configured');
  }

  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
  }));
  
  if (!result.Item) return;
  const business = result.Item as Business;
  const businessRecord = business as Record<string, unknown>;
  
  // SMART: Skip if already fetched (from tiered search)
  if (businessRecord.details_fetched === true) {
    console.log(`[Internal] Details already fetched for: ${business.business_name} - skipping`);
    return;
  }

  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  const fieldMask = [
    'id', 'displayName', 'formattedAddress', 'addressComponents',
    'nationalPhoneNumber', 'rating', 'userRatingCount', 'regularOpeningHours',
    'websiteUri', 'googleMapsUri', 'location', 'primaryType',
  ].join(',');

  // Get next available key (waits if rate limited)
  const apiKey = await getNextApiKey();

  const apiResponse = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
  });

  if (!apiResponse.ok) {
    throw new Error(`Places API failed: ${apiResponse.status}`);
  }

  const details = await apiResponse.json() as PlaceDetails;

  const streetNumber = extractAddressComponent(details.addressComponents, 'street_number');
  const route = extractAddressComponent(details.addressComponents, 'route');
  const state = extractAddressComponent(details.addressComponents, 'administrative_area_level_1');

  const updateFields: Record<string, unknown> = {
    address: details.formattedAddress || '',
    city: extractCity(details.formattedAddress || ''),
    state: state,
    street: [streetNumber, route].filter(Boolean).join(' '),
    zip_code: extractAddressComponent(details.addressComponents, 'postal_code'),
    phone: details.nationalPhoneNumber || '',
    rating: details.rating || null,
    rating_count: details.userRatingCount || null,
    hours: details.regularOpeningHours?.weekdayDescriptions?.join('; ') || '',
    google_maps_uri: details.googleMapsUri || '',
    latitude: details.location?.latitude || null,
    longitude: details.location?.longitude || null,
    website_uri: details.websiteUri || null,
    primary_type: details.primaryType || null,
    business_name: details.displayName?.text || business.business_name,
    friendly_slug: `${(details.displayName?.text || business.business_name || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${placeId.slice(-8)}`,
    details_fetched: true,
    has_website: !!details.websiteUri,
    details_fetched_at: new Date().toISOString(),
  };

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
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
  }));
}

/**
 * Internal version of generateReviews for on-demand preview
 * Returns void, updates DynamoDB directly
 * SMART: Skips if reviews already fetched
 */
async function fetchReviewsInternal(placeId: string): Promise<void> {
  if (!hasActiveApiKeys()) {
    throw new Error('Google API key not configured');
  }

  // Check if already fetched
  const checkResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
  }));
  
  if (!checkResult.Item) return;
  const businessRecord = checkResult.Item as Record<string, unknown>;
  
  // SMART: Skip if already fetched (from tiered search)
  if (businessRecord.reviews_fetched === true) {
    console.log(`[Internal] Reviews already fetched for: ${businessRecord.business_name} - skipping`);
    return;
  }

  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  const fieldMask = 'reviews,editorialSummary';

  // Get next available key (waits if rate limited)
  const apiKey = await getNextApiKey();

  const apiResponse = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
  });

  if (!apiResponse.ok) {
    throw new Error(`Places API failed: ${apiResponse.status}`);
  }

  const enrichment = await apiResponse.json() as PlaceEnrichment;

  const reviews = (enrichment.reviews || [])
    .slice(0, 5)
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
    reviews_fetched: true,
    reviews_fetched_at: new Date().toISOString(),
  };

  const updateParts: string[] = [];
  const expressionNames: Record<string, string> = {};
  const expressionValues: Record<string, unknown> = {};

  Object.entries(updateFields).forEach(([key, value], index) => {
    updateParts.push(`#attr${index} = :val${index}`);
    expressionNames[`#attr${index}`] = key;
    expressionValues[`:val${index}`] = value;
  });

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
  }));
}

/**
 * Internal version of generateCopy for on-demand preview
 * Returns void, updates DynamoDB directly
 * SMART: Skips if copy already generated
 */
async function generateCopyInternal(placeId: string): Promise<void> {
  if (!CLAUDE_API_KEY) {
    throw new Error('Claude API key not configured');
  }

  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
  }));
  
  if (!result.Item) return;
  const business = result.Item as Business;
  const businessRecord = business as Record<string, unknown>;
  
  // SMART: Skip if already generated
  if (businessRecord.copy_generated === true) {
    console.log(`[Internal] Copy already generated for: ${business.business_name} - skipping`);
    return;
  }

  const anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY });

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildUserPrompt(business) }],
    system: SYSTEM_PROMPT,
  });

  const textContent = message.content.find(block => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  const copy = JSON.parse(textContent.text) as LandingPageCopy;
  const flatCopy = flattenCopy(copy);

  const updateParts: string[] = ['#copy_generated = :true', '#updated_at = :now'];
  const expressionNames: Record<string, string> = {
    '#copy_generated': 'copy_generated',
    '#updated_at': 'updated_at',
  };
  const expressionValues: Record<string, unknown> = {
    ':true': true,
    ':now': new Date().toISOString(),
  };

  Object.entries(flatCopy).forEach(([key, value], index) => {
    updateParts.push(`#attr${index} = :val${index}`);
    expressionNames[`#attr${index}`] = key;
    expressionValues[`:val${index}`] = value;
  });

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { place_id: placeId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
  }));
}

