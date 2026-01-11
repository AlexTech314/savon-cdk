import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  GetCommand, 
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { 
  SFNClient, 
  StartExecutionCommand, 
  DescribeExecutionCommand,
  ListExecutionsCommand,
} from '@aws-sdk/client-sfn';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sfnClient = new SFNClient({});

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME!;
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN!;
const CAMPAIGNS_TABLE_NAME = process.env.CAMPAIGNS_TABLE_NAME!;

interface SearchQuery {
  textQuery: string;
  includedType?: string;
}

interface Campaign {
  campaign_id: string;
  name: string;
  searches: SearchQuery[];
  max_results_per_search: number;
  only_without_website: boolean;
}

interface JobInput {
  campaignId: string;
  // Populated from campaign
  jobType: 'places';
  searches: SearchQuery[];
  maxResultsPerSearch: number;
  onlyWithoutWebsite: boolean;
  // Pipeline flags - which steps to run
  runSearch: boolean;
  runDetails: boolean;
  runEnrich: boolean;
  runPhotos: boolean;
  runCopy: boolean;
}

interface Job {
  job_id: string;
  created_at: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
  job_type: string;
  campaign_id: string;
  campaign_name?: string;
  execution_arn?: string;
  input?: JobInput;
  started_at?: string;
  completed_at?: string;
  error?: string;
  expires_at?: number; // TTL for auto-cleanup (30 days)
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const { routeKey, pathParameters, queryStringParameters, body } = event;
  
  try {
    // GET /jobs - List jobs
    if (routeKey === 'GET /jobs') {
      return await listJobs(queryStringParameters);
    }
    
    // POST /jobs - Start new job
    if (routeKey === 'POST /jobs') {
      return await startJob(body);
    }
    
    // GET /jobs/{job_id} - Get job details
    if (routeKey === 'GET /jobs/{job_id}') {
      return await getJob(pathParameters?.job_id!);
    }
    
    return response(404, { error: 'Not found' });
  } catch (error) {
    console.error('Error:', error);
    return response(500, { error: 'Internal server error', details: String(error) });
  }
}

async function listJobs(
  queryParams?: Record<string, string | undefined>
): Promise<APIGatewayProxyResultV2> {
  const limit = parseInt(queryParams?.limit || '20', 10);
  const status = queryParams?.status;
  
  let command;
  
  if (status) {
    // Query by status using GSI
    command = new QueryCommand({
      TableName: JOBS_TABLE_NAME,
      IndexName: 'by-status',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
      ScanIndexForward: false, // Newest first
      Limit: limit,
    });
  } else {
    // Scan all jobs
    command = new ScanCommand({
      TableName: JOBS_TABLE_NAME,
      Limit: limit,
    });
  }
  
  const result = await docClient.send(command);
  const jobs = (result.Items || []) as Job[];
  
  // Fetch latest status from Step Functions for running jobs
  const enrichedJobs = await Promise.all(
    jobs.map(async (job) => {
      if (job.status === 'RUNNING' && job.execution_arn) {
        try {
          const execution = await sfnClient.send(
            new DescribeExecutionCommand({ executionArn: job.execution_arn })
          );
          
          // Update status if changed
          if (execution.status && execution.status !== job.status) {
            job.status = execution.status as Job['status'];
            job.completed_at = execution.stopDate?.toISOString();
            
            // Update in DynamoDB
            await docClient.send(new PutCommand({
              TableName: JOBS_TABLE_NAME,
              Item: job,
            }));
          }
        } catch (e) {
          console.warn(`Failed to get execution status for ${job.execution_arn}:`, e);
        }
      }
      return job;
    })
  );
  
  // Sort by created_at descending
  enrichedJobs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  
  return response(200, {
    jobs: enrichedJobs,
    count: enrichedJobs.length,
  });
}

async function startJob(body?: string): Promise<APIGatewayProxyResultV2> {
  if (!body) {
    return response(400, { error: 'Request body required' });
  }
  
  const requestBody = JSON.parse(body) as { campaignId: string };
  
  // Validate campaign_id is provided
  if (!requestBody.campaignId) {
    return response(400, { 
      error: 'campaignId is required', 
      details: 'Jobs must be started from a campaign' 
    });
  }
  
  // Fetch campaign from DynamoDB
  const campaignResult = await docClient.send(new GetCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Key: { campaign_id: requestBody.campaignId },
  }));
  
  if (!campaignResult.Item) {
    return response(404, { error: 'Campaign not found' });
  }
  
  const campaign = campaignResult.Item as Campaign;
  
  // Build job input from campaign
  // Default: run search and details to find and populate new businesses
  const jobInput: JobInput = {
    campaignId: campaign.campaign_id,
    jobType: 'places', // All campaign jobs are places (lead finding)
    searches: campaign.searches,
    maxResultsPerSearch: campaign.max_results_per_search,
    onlyWithoutWebsite: campaign.only_without_website,
    // Pipeline flags - search + details by default for campaigns
    runSearch: true,
    runDetails: true,
    runEnrich: false,  // Reviews - optional, costs extra
    runPhotos: false,  // Photos - optional, costs extra
    runCopy: false,    // LLM copy - optional, costs extra
  };
  
  // Generate job ID
  const jobId = randomUUID();
  const createdAt = new Date().toISOString();
  
  // Start Step Functions execution
  const executionName = `job-${jobId}`;
  
  const startResult = await sfnClient.send(new StartExecutionCommand({
    stateMachineArn: STATE_MACHINE_ARN,
    name: executionName,
    input: JSON.stringify(jobInput),
  }));
  
  // Create job record
  const job: Job = {
    job_id: jobId,
    created_at: createdAt,
    status: 'RUNNING',
    job_type: 'places',
    campaign_id: campaign.campaign_id,
    campaign_name: campaign.name,
    execution_arn: startResult.executionArn,
    input: jobInput,
    started_at: startResult.startDate?.toISOString(),
    expires_at: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days TTL
  };
  
  await docClient.send(new PutCommand({
    TableName: JOBS_TABLE_NAME,
    Item: job,
  }));
  
  // Update campaign's last_run_at
  await docClient.send(new PutCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Item: {
      ...campaign,
      last_run_at: createdAt,
      updated_at: createdAt,
    },
  }));
  
  return response(201, {
    job,
    message: 'Job started successfully',
  });
}

async function getJob(jobId: string): Promise<APIGatewayProxyResultV2> {
  // Get job from DynamoDB (need to scan since we don't have the sort key)
  const scanResult = await docClient.send(new ScanCommand({
    TableName: JOBS_TABLE_NAME,
    FilterExpression: 'job_id = :jobId',
    ExpressionAttributeValues: { ':jobId': jobId },
    Limit: 1,
  }));
  
  if (!scanResult.Items || scanResult.Items.length === 0) {
    return response(404, { error: 'Job not found' });
  }
  
  const job = scanResult.Items[0] as Job;
  
  // Get latest status from Step Functions
  if (job.execution_arn) {
    try {
      const execution = await sfnClient.send(
        new DescribeExecutionCommand({ executionArn: job.execution_arn })
      );
      
      job.status = execution.status as Job['status'];
      job.completed_at = execution.stopDate?.toISOString();
      
      if (execution.error) {
        job.error = execution.error;
      }
      
      // Update in DynamoDB if status changed
      if (execution.status !== job.status) {
        await docClient.send(new PutCommand({
          TableName: JOBS_TABLE_NAME,
          Item: job,
        }));
      }
      
      return response(200, {
        ...job,
        execution: {
          status: execution.status,
          startDate: execution.startDate,
          stopDate: execution.stopDate,
          input: execution.input ? JSON.parse(execution.input) : undefined,
          output: execution.output ? JSON.parse(execution.output) : undefined,
        },
      });
    } catch (e) {
      console.warn(`Failed to get execution details for ${job.execution_arn}:`, e);
    }
  }
  
  return response(200, job);
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

