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

interface JobInput {
  jobType: 'places' | 'copy' | 'both';
  businessTypes?: string[];
  states?: string[];
  countPerType?: number;
  placeIds?: string[];
  allMissingCopy?: boolean;
}

interface Job {
  job_id: string;
  created_at: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
  job_type: string;
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
  
  const input = JSON.parse(body) as JobInput;
  
  // Validate job type
  if (!['places', 'copy', 'both'].includes(input.jobType)) {
    return response(400, { 
      error: 'Invalid jobType', 
      details: 'jobType must be "places", "copy", or "both"' 
    });
  }
  
  // Generate job ID
  const jobId = randomUUID();
  const createdAt = new Date().toISOString();
  
  // Start Step Functions execution
  const executionName = `job-${jobId}`;
  
  const startResult = await sfnClient.send(new StartExecutionCommand({
    stateMachineArn: STATE_MACHINE_ARN,
    name: executionName,
    input: JSON.stringify(input),
  }));
  
  // Create job record
  const job: Job = {
    job_id: jobId,
    created_at: createdAt,
    status: 'RUNNING',
    job_type: input.jobType,
    execution_arn: startResult.executionArn,
    input,
    started_at: startResult.startDate?.toISOString(),
    expires_at: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days TTL
  };
  
  await docClient.send(new PutCommand({
    TableName: JOBS_TABLE_NAME,
    Item: job,
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

