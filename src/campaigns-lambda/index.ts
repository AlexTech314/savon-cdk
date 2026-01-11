import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  GetCommand, 
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const s3Client = new S3Client({});

const CAMPAIGNS_TABLE_NAME = process.env.CAMPAIGNS_TABLE_NAME!;
const CAMPAIGN_DATA_BUCKET = process.env.CAMPAIGN_DATA_BUCKET!;

// Presigned URL expiration: 1 hour
const PRESIGNED_URL_EXPIRY = 3600;

interface SearchQuery {
  textQuery: string;
  includedType?: string;
}

/**
 * Data tier determines which Google Places API fields are fetched during search.
 * Higher tiers cost more but get more data in a single call.
 * 
 * - pro: $32/1000 - Basic data (address, location, types, business status)
 * - enterprise: $35/1000 - Pro + phone, website, rating, hours, price level
 * - enterprise_atmosphere: $40/1000 - Enterprise + reviews, atmosphere data (delivery, dine-in, etc.)
 */
type DataTier = 'pro' | 'enterprise' | 'enterprise_atmosphere';

/**
 * Campaign stored in DynamoDB - searches are stored in S3, not here
 */
interface Campaign {
  campaign_id: string;
  name: string;
  description?: string;
  searches_s3_key: string;  // S3 key where searches are stored
  searches_count: number;   // Number of searches (for display without fetching S3)
  max_results_per_search: number;
  only_without_website: boolean;
  data_tier: DataTier;
  created_at: string;
  updated_at: string;
  last_run_at?: string;
}

/**
 * Campaign response includes searches fetched from S3
 */
interface CampaignWithSearches extends Omit<Campaign, 'searches_s3_key'> {
  searches: SearchQuery[];
}

interface CreateCampaignInput {
  name: string;
  description?: string;
  maxResultsPerSearch?: number;
  onlyWithoutWebsite?: boolean;
  dataTier?: DataTier;
}

interface UpdateCampaignInput {
  name?: string;
  description?: string;
  maxResultsPerSearch?: number;
  onlyWithoutWebsite?: boolean;
  dataTier?: DataTier;
  updateSearches?: boolean; // If true, return presigned URL for new searches upload
}

interface ConfirmUploadInput {
  searchesCount: number;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { routeKey, pathParameters, body } = event;
  
  try {
    // GET /campaigns - List all campaigns
    if (routeKey === 'GET /campaigns') {
      return await listCampaigns();
    }
    
    // POST /campaigns - Create new campaign
    if (routeKey === 'POST /campaigns') {
      return await createCampaign(body);
    }
    
    // GET /campaigns/{campaign_id} - Get single campaign
    if (routeKey === 'GET /campaigns/{campaign_id}') {
      return await getCampaign(pathParameters?.campaign_id!);
    }
    
    // PUT /campaigns/{campaign_id} - Update campaign
    if (routeKey === 'PUT /campaigns/{campaign_id}') {
      return await updateCampaign(pathParameters?.campaign_id!, body);
    }
    
    // DELETE /campaigns/{campaign_id} - Delete campaign
    if (routeKey === 'DELETE /campaigns/{campaign_id}') {
      return await deleteCampaign(pathParameters?.campaign_id!);
    }
    
    // PATCH /campaigns/{campaign_id}/run - Mark campaign as run (update last_run_at)
    if (routeKey === 'PATCH /campaigns/{campaign_id}/run') {
      return await markCampaignRun(pathParameters?.campaign_id!);
    }
    
    // POST /campaigns/{campaign_id}/confirm-upload - Confirm searches upload
    if (routeKey === 'POST /campaigns/{campaign_id}/confirm-upload') {
      return await confirmSearchesUpload(pathParameters?.campaign_id!, body);
    }
    
    return response(404, { error: 'Not found' });
  } catch (error) {
    console.error('Error:', error);
    return response(500, { error: 'Internal server error', details: String(error) });
  }
}

/**
 * Get S3 key for campaign searches
 */
function getSearchesS3Key(campaignId: string): string {
  return `campaigns/${campaignId}/searches.json`;
}

/**
 * Generate presigned PUT URL for uploading searches
 */
async function generateUploadUrl(campaignId: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: CAMPAIGN_DATA_BUCKET,
    Key: getSearchesS3Key(campaignId),
    ContentType: 'application/json',
  });
  
  return getSignedUrl(s3Client, command, { expiresIn: PRESIGNED_URL_EXPIRY });
}

/**
 * Fetch searches from S3
 */
async function fetchSearchesFromS3(s3Key: string): Promise<SearchQuery[]> {
  try {
    const result = await s3Client.send(new GetObjectCommand({
      Bucket: CAMPAIGN_DATA_BUCKET,
      Key: s3Key,
    }));
    
    const bodyStr = await result.Body?.transformToString();
    if (!bodyStr) return [];
    
    const data = JSON.parse(bodyStr);
    return data.searches || [];
  } catch (error) {
    console.error(`Failed to fetch searches from S3 (${s3Key}):`, error);
    return [];
  }
}

/**
 * Delete searches from S3
 */
async function deleteSearchesFromS3(s3Key: string): Promise<void> {
  try {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: CAMPAIGN_DATA_BUCKET,
      Key: s3Key,
    }));
  } catch (error) {
    console.error(`Failed to delete searches from S3 (${s3Key}):`, error);
  }
}

/**
 * List all campaigns (without fetching searches from S3)
 */
async function listCampaigns(): Promise<APIGatewayProxyResultV2> {
  const result = await docClient.send(new ScanCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
  }));
  
  const campaigns = (result.Items || []) as Campaign[];
  
  // Sort by created_at descending (newest first)
  campaigns.sort((a, b) => b.created_at.localeCompare(a.created_at));
  
  // Return campaigns with searches_count but without fetching actual searches
  const campaignsForList = campaigns.map(c => ({
    campaign_id: c.campaign_id,
    name: c.name,
    description: c.description,
    searches_count: c.searches_count || 0,
    max_results_per_search: c.max_results_per_search,
    only_without_website: c.only_without_website,
    data_tier: c.data_tier,
    created_at: c.created_at,
    updated_at: c.updated_at,
    last_run_at: c.last_run_at,
  }));
  
  return response(200, {
    campaigns: campaignsForList,
    count: campaignsForList.length,
  });
}

/**
 * Create a new campaign - returns presigned URL for uploading searches
 */
async function createCampaign(body?: string): Promise<APIGatewayProxyResultV2> {
  if (!body) {
    return response(400, { error: 'Request body required' });
  }
  
  const input = JSON.parse(body) as CreateCampaignInput;
  
  // Validate required fields
  if (!input.name || !input.name.trim()) {
    return response(400, { error: 'Campaign name is required' });
  }
  
  const now = new Date().toISOString();
  const campaignId = randomUUID();
  
  // Validate data tier
  const validTiers: DataTier[] = ['pro', 'enterprise', 'enterprise_atmosphere'];
  const dataTier = input.dataTier || 'enterprise';
  if (!validTiers.includes(dataTier)) {
    return response(400, { 
      error: 'Invalid dataTier', 
      details: `Must be one of: ${validTiers.join(', ')}` 
    });
  }

  const s3Key = getSearchesS3Key(campaignId);
  
  const campaign: Campaign = {
    campaign_id: campaignId,
    name: input.name.trim(),
    description: input.description?.trim(),
    searches_s3_key: s3Key,
    searches_count: 0, // Will be updated after upload confirmation
    max_results_per_search: Math.min(input.maxResultsPerSearch ?? 60, 60),
    only_without_website: input.onlyWithoutWebsite ?? true,
    data_tier: dataTier,
    created_at: now,
    updated_at: now,
  };
  
  await docClient.send(new PutCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Item: campaign,
  }));
  
  // Generate presigned URL for uploading searches
  const uploadUrl = await generateUploadUrl(campaignId);
  
  return response(201, { 
    campaign: {
      ...campaign,
      searches: [], // No searches yet
    },
    uploadUrl,
    message: 'Campaign created. Upload searches to the provided URL, then call confirm-upload.',
  });
}

/**
 * Get a single campaign with searches fetched from S3
 */
async function getCampaign(campaignId: string): Promise<APIGatewayProxyResultV2> {
  const result = await docClient.send(new GetCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Key: { campaign_id: campaignId },
  }));
  
  if (!result.Item) {
    return response(404, { error: 'Campaign not found' });
  }
  
  const campaign = result.Item as Campaign;
  
  // Fetch searches from S3
  const searches = await fetchSearchesFromS3(campaign.searches_s3_key);
  
  // Return campaign with searches
  const campaignWithSearches: CampaignWithSearches = {
    campaign_id: campaign.campaign_id,
    name: campaign.name,
    description: campaign.description,
    searches,
    searches_count: campaign.searches_count,
    max_results_per_search: campaign.max_results_per_search,
    only_without_website: campaign.only_without_website,
    data_tier: campaign.data_tier,
    created_at: campaign.created_at,
    updated_at: campaign.updated_at,
    last_run_at: campaign.last_run_at,
  };
  
  return response(200, { campaign: campaignWithSearches });
}

/**
 * Update a campaign - returns presigned URL if updateSearches is true
 */
async function updateCampaign(campaignId: string, body?: string): Promise<APIGatewayProxyResultV2> {
  if (!body) {
    return response(400, { error: 'Request body required' });
  }
  
  // First check if campaign exists
  const existing = await docClient.send(new GetCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Key: { campaign_id: campaignId },
  }));
  
  if (!existing.Item) {
    return response(404, { error: 'Campaign not found' });
  }
  
  const input = JSON.parse(body) as UpdateCampaignInput;
  const now = new Date().toISOString();
  
  // Build update expression dynamically
  const updateParts: string[] = ['#updated_at = :updated_at'];
  const expressionNames: Record<string, string> = { '#updated_at': 'updated_at' };
  const expressionValues: Record<string, unknown> = { ':updated_at': now };
  
  if (input.name !== undefined) {
    updateParts.push('#name = :name');
    expressionNames['#name'] = 'name';
    expressionValues[':name'] = input.name.trim();
  }
  
  if (input.description !== undefined) {
    updateParts.push('#description = :description');
    expressionNames['#description'] = 'description';
    expressionValues[':description'] = input.description?.trim() || null;
  }
  
  if (input.maxResultsPerSearch !== undefined) {
    updateParts.push('#max_results = :max_results');
    expressionNames['#max_results'] = 'max_results_per_search';
    expressionValues[':max_results'] = Math.min(input.maxResultsPerSearch, 60);
  }
  
  if (input.onlyWithoutWebsite !== undefined) {
    updateParts.push('#only_without = :only_without');
    expressionNames['#only_without'] = 'only_without_website';
    expressionValues[':only_without'] = input.onlyWithoutWebsite;
  }
  
  if (input.dataTier !== undefined) {
    const validTiers: DataTier[] = ['pro', 'enterprise', 'enterprise_atmosphere'];
    if (!validTiers.includes(input.dataTier)) {
      return response(400, { 
        error: 'Invalid dataTier', 
        details: `Must be one of: ${validTiers.join(', ')}` 
      });
    }
    updateParts.push('#data_tier = :data_tier');
    expressionNames['#data_tier'] = 'data_tier';
    expressionValues[':data_tier'] = input.dataTier;
  }
  
  const result = await docClient.send(new UpdateCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Key: { campaign_id: campaignId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
    ReturnValues: 'ALL_NEW',
  }));
  
  const updatedCampaign = result.Attributes as Campaign;
  
  // If updateSearches is requested, return presigned URL
  let uploadUrl: string | undefined;
  if (input.updateSearches) {
    uploadUrl = await generateUploadUrl(campaignId);
  }
  
  // Fetch current searches for the response
  const searches = await fetchSearchesFromS3(updatedCampaign.searches_s3_key);
  
  const responseData: Record<string, unknown> = {
    campaign: {
      ...updatedCampaign,
      searches,
    },
  };
  
  if (uploadUrl) {
    responseData.uploadUrl = uploadUrl;
    responseData.message = 'Upload new searches to the provided URL, then call confirm-upload.';
  }
  
  return response(200, responseData);
}

/**
 * Confirm that searches have been uploaded to S3
 */
async function confirmSearchesUpload(campaignId: string, body?: string): Promise<APIGatewayProxyResultV2> {
  if (!body) {
    return response(400, { error: 'Request body required' });
  }
  
  const input = JSON.parse(body) as ConfirmUploadInput;
  
  if (typeof input.searchesCount !== 'number' || input.searchesCount < 0) {
    return response(400, { error: 'searchesCount is required and must be a non-negative number' });
  }
  
  // Verify campaign exists
  const existing = await docClient.send(new GetCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Key: { campaign_id: campaignId },
  }));
  
  if (!existing.Item) {
    return response(404, { error: 'Campaign not found' });
  }
  
  const campaign = existing.Item as Campaign;
  
  // Verify the S3 object exists
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: CAMPAIGN_DATA_BUCKET,
      Key: campaign.searches_s3_key,
    }));
  } catch {
    return response(400, { 
      error: 'Searches file not found in S3',
      details: 'Please upload the searches file before confirming.',
    });
  }
  
  // Update the searches count
  const now = new Date().toISOString();
  const result = await docClient.send(new UpdateCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Key: { campaign_id: campaignId },
    UpdateExpression: 'SET #count = :count, #updated = :updated',
    ExpressionAttributeNames: {
      '#count': 'searches_count',
      '#updated': 'updated_at',
    },
    ExpressionAttributeValues: {
      ':count': input.searchesCount,
      ':updated': now,
    },
    ReturnValues: 'ALL_NEW',
  }));
  
  const updatedCampaign = result.Attributes as Campaign;
  
  // Fetch searches for response
  const searches = await fetchSearchesFromS3(updatedCampaign.searches_s3_key);
  
  return response(200, { 
    campaign: {
      ...updatedCampaign,
      searches,
    },
    message: 'Searches upload confirmed.',
  });
}

/**
 * Delete a campaign and its S3 data
 */
async function deleteCampaign(campaignId: string): Promise<APIGatewayProxyResultV2> {
  // Check if campaign exists first
  const existing = await docClient.send(new GetCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Key: { campaign_id: campaignId },
  }));
  
  if (!existing.Item) {
    return response(404, { error: 'Campaign not found' });
  }
  
  const campaign = existing.Item as Campaign;
  
  // Delete S3 object
  await deleteSearchesFromS3(campaign.searches_s3_key);
  
  // Delete DynamoDB item
  await docClient.send(new DeleteCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Key: { campaign_id: campaignId },
  }));
  
  return response(200, { success: true, message: 'Campaign deleted' });
}

async function markCampaignRun(campaignId: string): Promise<APIGatewayProxyResultV2> {
  const now = new Date().toISOString();
  
  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: CAMPAIGNS_TABLE_NAME,
      Key: { campaign_id: campaignId },
      UpdateExpression: 'SET #last_run = :now, #updated = :now',
      ExpressionAttributeNames: {
        '#last_run': 'last_run_at',
        '#updated': 'updated_at',
      },
      ExpressionAttributeValues: {
        ':now': now,
      },
      ConditionExpression: 'attribute_exists(campaign_id)',
      ReturnValues: 'ALL_NEW',
    }));
    
    return response(200, { campaign: result.Attributes });
  } catch (error: unknown) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return response(404, { error: 'Campaign not found' });
    }
    throw error;
  }
}

function response(
  statusCode: number, 
  body: unknown
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
    },
    body: JSON.stringify(body),
  };
}
