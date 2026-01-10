import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  GetCommand, 
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CAMPAIGNS_TABLE_NAME = process.env.CAMPAIGNS_TABLE_NAME!;

interface SearchQuery {
  textQuery: string;
  includedType?: string;
}

interface Campaign {
  campaign_id: string;
  name: string;
  description?: string;
  searches: SearchQuery[];
  max_results_per_search: number;
  only_without_website: boolean;
  created_at: string;
  updated_at: string;
  last_run_at?: string;
}

interface CreateCampaignInput {
  name: string;
  description?: string;
  searches: SearchQuery[];
  maxResultsPerSearch?: number;
  onlyWithoutWebsite?: boolean;
}

interface UpdateCampaignInput {
  name?: string;
  description?: string;
  searches?: SearchQuery[];
  maxResultsPerSearch?: number;
  onlyWithoutWebsite?: boolean;
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
    
    return response(404, { error: 'Not found' });
  } catch (error) {
    console.error('Error:', error);
    return response(500, { error: 'Internal server error', details: String(error) });
  }
}

async function listCampaigns(): Promise<APIGatewayProxyResultV2> {
  const result = await docClient.send(new ScanCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
  }));
  
  const campaigns = (result.Items || []) as Campaign[];
  
  // Sort by created_at descending (newest first)
  campaigns.sort((a, b) => b.created_at.localeCompare(a.created_at));
  
  return response(200, {
    campaigns,
    count: campaigns.length,
  });
}

async function createCampaign(body?: string): Promise<APIGatewayProxyResultV2> {
  if (!body) {
    return response(400, { error: 'Request body required' });
  }
  
  const input = JSON.parse(body) as CreateCampaignInput;
  
  // Validate required fields
  if (!input.name || !input.name.trim()) {
    return response(400, { error: 'Campaign name is required' });
  }
  
  if (!input.searches || input.searches.length === 0) {
    return response(400, { error: 'At least one search query is required' });
  }
  
  const now = new Date().toISOString();
  
  const campaign: Campaign = {
    campaign_id: randomUUID(),
    name: input.name.trim(),
    description: input.description?.trim(),
    searches: input.searches,
    max_results_per_search: input.maxResultsPerSearch ?? 500,
    only_without_website: input.onlyWithoutWebsite ?? true,
    created_at: now,
    updated_at: now,
  };
  
  await docClient.send(new PutCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Item: campaign,
  }));
  
  return response(201, { campaign });
}

async function getCampaign(campaignId: string): Promise<APIGatewayProxyResultV2> {
  const result = await docClient.send(new GetCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Key: { campaign_id: campaignId },
  }));
  
  if (!result.Item) {
    return response(404, { error: 'Campaign not found' });
  }
  
  return response(200, { campaign: result.Item });
}

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
  
  if (input.searches !== undefined) {
    updateParts.push('#searches = :searches');
    expressionNames['#searches'] = 'searches';
    expressionValues[':searches'] = input.searches;
  }
  
  if (input.maxResultsPerSearch !== undefined) {
    updateParts.push('#max_results = :max_results');
    expressionNames['#max_results'] = 'max_results_per_search';
    expressionValues[':max_results'] = input.maxResultsPerSearch;
  }
  
  if (input.onlyWithoutWebsite !== undefined) {
    updateParts.push('#only_without = :only_without');
    expressionNames['#only_without'] = 'only_without_website';
    expressionValues[':only_without'] = input.onlyWithoutWebsite;
  }
  
  const result = await docClient.send(new UpdateCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Key: { campaign_id: campaignId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
    ReturnValues: 'ALL_NEW',
  }));
  
  return response(200, { campaign: result.Attributes });
}

async function deleteCampaign(campaignId: string): Promise<APIGatewayProxyResultV2> {
  // Check if campaign exists first
  const existing = await docClient.send(new GetCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Key: { campaign_id: campaignId },
  }));
  
  if (!existing.Item) {
    return response(404, { error: 'Campaign not found' });
  }
  
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
