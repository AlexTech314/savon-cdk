import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  GetCommand, 
  PutCommand, 
  DeleteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.BUSINESSES_TABLE_NAME!;

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
      return await exportBusinesses();
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
  const lastKey = queryParams?.lastKey ? JSON.parse(decodeURIComponent(queryParams.lastKey)) : undefined;
  const searchTerm = queryParams?.q?.toLowerCase();
  
  const command = new ScanCommand({
    TableName: TABLE_NAME,
    Limit: searchTerm ? undefined : limit, // Don't limit if searching (need to filter)
    ExclusiveStartKey: lastKey,
  });
  
  const result = await docClient.send(command);
  let items = result.Items || [];
  
  // Simple search filter (for small datasets; use OpenSearch for production)
  if (searchTerm) {
    items = items.filter(item => {
      const searchableFields = ['business_name', 'city', 'state', 'business_type', 'address'];
      return searchableFields.some(field => 
        String(item[field] || '').toLowerCase().includes(searchTerm)
      );
    }).slice(0, limit);
  }
  
  return response(200, {
    items,
    lastKey: result.LastEvaluatedKey 
      ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey))
      : null,
    count: items.length,
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

async function exportBusinesses(): Promise<APIGatewayProxyResultV2> {
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
  
  // Get all unique columns
  const columns = [...new Set(items.flatMap(item => Object.keys(item)))];
  
  const csv = stringify(items, {
    header: true,
    columns,
  });
  
  return response(200, csv, { 
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="businesses_${Date.now()}.csv"`,
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

