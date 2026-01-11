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
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
const sfnClient = new SFNClient({});

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME!;
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN!;
const CAMPAIGNS_TABLE_NAME = process.env.CAMPAIGNS_TABLE_NAME!;

/**
 * Data tier determines which Google Places API fields are fetched during search.
 * 
 * - pro: $32/1000 - Basic data (address, location, types, business status)
 * - enterprise: $35/1000 - Pro + phone, website, rating, hours, price level
 * - enterprise_atmosphere: $40/1000 - Enterprise + reviews, atmosphere data
 */
type DataTier = 'pro' | 'enterprise' | 'enterprise_atmosphere';

/**
 * Campaign stored in DynamoDB - searches are stored in S3
 */
interface Campaign {
  campaign_id: string;
  name: string;
  searches_s3_key: string;  // S3 key where searches are stored
  searches_count: number;   // Number of searches
  max_results_per_search: number;
  only_without_website: boolean;
  data_tier?: DataTier;
}

interface FilterRule {
  field: string;  // e.g., 'state', 'city', 'business_type'
  operator: 'EXISTS' | 'NOT_EXISTS' | 'EQUALS' | 'NOT_EQUALS';
  value?: string;
}

interface JobInput {
  // Campaign fields (optional for pipeline jobs)
  campaignId?: string;
  jobType: 'places' | 'pipeline';
  searchesS3Key?: string;  // S3 key for searches (search-task will fetch from S3)
  maxResultsPerSearch?: number;
  onlyWithoutWebsite?: boolean;
  dataTier?: DataTier;
  // Pipeline flags - which steps to run
  runSearch: boolean;
  runDetails: boolean;
  runEnrich: boolean;
  runPhotos: boolean;
  runCopy: boolean;
  // Pipeline options
  skipWithWebsite?: boolean;
  // Filter rules - only process businesses matching ALL rules
  filterRules?: FilterRule[];
  // Search cache options
  skipCachedSearches?: boolean; // Skip searches run in the last 30 days
}

interface Job {
  job_id: string;
  created_at: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
  job_type: string;
  job_name?: string;  // Human-readable name for the job
  campaign_id?: string;  // Optional - only for campaign jobs
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

interface PipelineJobRequest {
  jobType: 'pipeline';
  runDetails: boolean;
  runEnrich: boolean;
  runPhotos: boolean;
  runCopy: boolean;
  skipWithWebsite?: boolean;
  filterRules?: FilterRule[];
}

interface CampaignJobRequest {
  campaignId: string;
  skipCachedSearches?: boolean; // Skip searches run in the last 30 days
}

type StartJobRequest = PipelineJobRequest | CampaignJobRequest;

function isPipelineJobRequest(req: StartJobRequest): req is PipelineJobRequest {
  return 'jobType' in req && req.jobType === 'pipeline';
}

async function startJob(body?: string): Promise<APIGatewayProxyResultV2> {
  if (!body) {
    return response(400, { error: 'Request body required' });
  }
  
  const requestBody = JSON.parse(body) as StartJobRequest;
  
  // Handle pipeline jobs (run on existing businesses)
  if (isPipelineJobRequest(requestBody)) {
    return startPipelineJob(requestBody);
  }
  
  // Handle campaign jobs (search for new businesses)
  return startCampaignJob(requestBody);
}

async function startPipelineJob(request: PipelineJobRequest): Promise<APIGatewayProxyResultV2> {
  const { runDetails, runEnrich, runPhotos, runCopy, skipWithWebsite = true, filterRules = [] } = request;
  
  // At least one step must be selected
  if (!runDetails && !runEnrich && !runPhotos && !runCopy) {
    return response(400, { 
      error: 'At least one pipeline step must be selected',
      details: 'Select runDetails, runEnrich, runPhotos, or runCopy'
    });
  }
  
  // Build job input
  const jobInput: JobInput = {
    jobType: 'pipeline',
    runSearch: false,  // Pipeline jobs don't search
    runDetails,
    runEnrich,
    runPhotos,
    runCopy,
    skipWithWebsite,
    filterRules: filterRules.length > 0 ? filterRules : undefined,
  };
  
  // Generate job ID and name
  const jobId = randomUUID();
  const createdAt = new Date().toISOString();
  
  // Build human-readable job name
  const steps: string[] = [];
  if (runDetails) steps.push('Details');
  if (runEnrich) steps.push('Reviews');
  if (runPhotos) steps.push('Photos');
  if (runCopy) steps.push('Copy');
  const jobName = `Pipeline: ${steps.join(' → ')}`;
  
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
    job_type: 'pipeline',
    job_name: jobName,
    execution_arn: startResult.executionArn,
    input: jobInput,
    started_at: startResult.startDate?.toISOString(),
    expires_at: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days TTL
  };
  
  await docClient.send(new PutCommand({
    TableName: JOBS_TABLE_NAME,
    Item: job,
  }));
  
  return response(201, {
    job,
    message: 'Pipeline job started successfully',
  });
}

async function startCampaignJob(request: CampaignJobRequest): Promise<APIGatewayProxyResultV2> {
  const { campaignId, skipCachedSearches = true } = request; // Default to skipping cached searches
  
  if (!campaignId) {
    return response(400, { 
      error: 'campaignId is required for campaign jobs',
    });
  }
  
  // Fetch campaign from DynamoDB
  const campaignResult = await docClient.send(new GetCommand({
    TableName: CAMPAIGNS_TABLE_NAME,
    Key: { campaign_id: campaignId },
  }));
  
  if (!campaignResult.Item) {
    return response(404, { error: 'Campaign not found' });
  }
  
  const campaign = campaignResult.Item as Campaign;
  
  // Check that campaign has searches uploaded
  if (!campaign.searches_s3_key) {
    return response(400, { 
      error: 'Campaign has no searches configured',
      details: 'Please upload searches before running the campaign.',
    });
  }
  
  // Build job input from campaign
  // Campaigns only run search to find new businesses
  const dataTier = campaign.data_tier || 'enterprise';
  
  const jobInput: JobInput = {
    campaignId: campaign.campaign_id,
    jobType: 'places',
    searchesS3Key: campaign.searches_s3_key,  // Search task will fetch from S3
    maxResultsPerSearch: campaign.max_results_per_search,
    onlyWithoutWebsite: campaign.only_without_website,
    dataTier,
    // Pipeline flags - only search for campaigns
    runSearch: true,
    runDetails: false,
    runEnrich: false,
    runPhotos: false,
    runCopy: false,
    // Cache options
    skipCachedSearches,
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
  
  // Create human-readable tier label
  const tierLabels: Record<DataTier, string> = {
    pro: 'Pro',
    enterprise: 'Enterprise',
    enterprise_atmosphere: 'Enterprise+Atm',
  };
  
  // Create job record
  const job: Job = {
    job_id: jobId,
    created_at: createdAt,
    status: 'RUNNING',
    job_type: 'places',
    job_name: `Campaign: ${campaign.name} [${tierLabels[dataTier]}]${skipCachedSearches ? '' : ' (fresh)'}`,
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
    message: 'Campaign job started successfully',
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

