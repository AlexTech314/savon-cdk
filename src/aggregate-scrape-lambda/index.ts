import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const s3Client = new S3Client({});

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME!;
const CAMPAIGN_DATA_BUCKET = process.env.CAMPAIGN_DATA_BUCKET!;

// ============ Types ============

interface ScrapeMetrics {
  processed: number;
  failed: number;
  filtered: number;
  cloudscraper_count: number;
  puppeteer_count: number;
  total_pages: number;
  total_bytes: number;
}

interface AggregateInput {
  jobId: string;
  prepareResult: {
    Payload: {
      bucket: string;
      itemsS3Key: string;
      totalBusinesses: number;
      jobId: string;
    };
  };
  // ResultWriterV2 output - the distributed map result
  ResultWriterDetails?: {
    Bucket: string;
    Key: string;
  };
}

interface AggregateOutput {
  jobId: string;
  aggregatedMetrics: ScrapeMetrics;
  totalBatches: number;
  successfulBatches: number;
  failedBatches: number;
}

interface DistributedMapResult {
  ResultFiles?: {
    SUCCEEDED?: Array<{ Key: string; Size: number }>;
    FAILED?: Array<{ Key: string; Size: number }>;
    PENDING?: Array<{ Key: string; Size: number }>;
  };
}

interface ChildExecutionResult {
  Output?: string;
  Error?: string;
  Cause?: string;
}

// ============ Handler ============

export async function handler(event: AggregateInput): Promise<AggregateOutput> {
  console.log('AggregateScrape input:', JSON.stringify(event, null, 2));
  
  const jobId = event.jobId || event.prepareResult?.Payload?.jobId;
  
  if (!jobId) {
    throw new Error('jobId is required');
  }
  
  // Initialize aggregated metrics
  const aggregatedMetrics: ScrapeMetrics = {
    processed: 0,
    failed: 0,
    filtered: 0,
    cloudscraper_count: 0,
    puppeteer_count: 0,
    total_pages: 0,
    total_bytes: 0,
  };
  
  let totalBatches = 0;
  let successfulBatches = 0;
  let failedBatches = 0;
  
  // Read results from ResultWriterV2 output
  if (event.ResultWriterDetails?.Key) {
    try {
      const manifestResult = await s3Client.send(new GetObjectCommand({
        Bucket: event.ResultWriterDetails.Bucket || CAMPAIGN_DATA_BUCKET,
        Key: event.ResultWriterDetails.Key,
      }));
      
      const manifestStr = await manifestResult.Body?.transformToString();
      if (manifestStr) {
        const manifest: DistributedMapResult = JSON.parse(manifestStr);
        
        // Process succeeded results
        if (manifest.ResultFiles?.SUCCEEDED) {
          for (const file of manifest.ResultFiles.SUCCEEDED) {
            totalBatches++;
            successfulBatches++;
            
            try {
              const resultData = await s3Client.send(new GetObjectCommand({
                Bucket: event.ResultWriterDetails.Bucket || CAMPAIGN_DATA_BUCKET,
                Key: file.Key,
              }));
              
              const resultStr = await resultData.Body?.transformToString();
              if (resultStr) {
                // ResultWriterV2 writes JSON Lines format
                const lines = resultStr.trim().split('\n');
                for (const line of lines) {
                  if (!line.trim()) continue;
                  const result: ChildExecutionResult = JSON.parse(line);
                  if (result.Output) {
                    const metrics = parseMetricsFromOutput(result.Output);
                    if (metrics) {
                      aggregateMetrics(aggregatedMetrics, metrics);
                    }
                  }
                }
              }
            } catch (err) {
              console.error(`Failed to read result file ${file.Key}:`, err);
            }
          }
        }
        
        // Count failed results
        if (manifest.ResultFiles?.FAILED) {
          failedBatches = manifest.ResultFiles.FAILED.length;
          totalBatches += failedBatches;
        }
      }
    } catch (err) {
      console.error('Failed to read ResultWriterV2 manifest:', err);
    }
  } else {
    // Fallback: List and read results from the standard prefix
    const resultsPrefix = `jobs/${jobId}/scrape-results/`;
    
    try {
      const listResult = await s3Client.send(new ListObjectsV2Command({
        Bucket: CAMPAIGN_DATA_BUCKET,
        Prefix: resultsPrefix,
      }));
      
      const resultFiles = listResult.Contents || [];
      console.log(`Found ${resultFiles.length} result files in ${resultsPrefix}`);
      
      for (const file of resultFiles) {
        if (!file.Key || file.Key.endsWith('/')) continue;
        
        totalBatches++;
        
        try {
          const resultData = await s3Client.send(new GetObjectCommand({
            Bucket: CAMPAIGN_DATA_BUCKET,
            Key: file.Key,
          }));
          
          const resultStr = await resultData.Body?.transformToString();
          if (resultStr) {
            const lines = resultStr.trim().split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const result = JSON.parse(line);
                const metrics = parseMetricsFromOutput(result.Output || JSON.stringify(result));
                if (metrics) {
                  aggregateMetrics(aggregatedMetrics, metrics);
                  successfulBatches++;
                }
              } catch {
                // Not valid JSON, skip
              }
            }
          }
        } catch (err) {
          console.error(`Failed to read result file ${file.Key}:`, err);
          failedBatches++;
        }
      }
    } catch (err) {
      console.error('Failed to list result files:', err);
    }
  }
  
  console.log('Aggregated metrics:', aggregatedMetrics);
  console.log(`Batches: ${successfulBatches} succeeded, ${failedBatches} failed, ${totalBatches} total`);
  
  // Update job record with aggregated metrics
  await updateJobMetrics(jobId, aggregatedMetrics, totalBatches, successfulBatches, failedBatches);
  
  return {
    jobId,
    aggregatedMetrics,
    totalBatches,
    successfulBatches,
    failedBatches,
  };
}

// ============ Helper Functions ============

/**
 * Parse metrics from ECS task output.
 * The scrape task logs: SCRAPE_RESULT:{...json...}
 */
function parseMetricsFromOutput(output: string): Partial<ScrapeMetrics> | null {
  try {
    // Try to parse directly as JSON first
    const parsed = JSON.parse(output);
    if (typeof parsed.processed === 'number') {
      return parsed;
    }
  } catch {
    // Not direct JSON, try to find SCRAPE_RESULT marker
  }
  
  // Look for SCRAPE_RESULT:{...} in the output
  const match = output.match(/SCRAPE_RESULT:(\{[^}]+\})/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {
      console.error('Failed to parse SCRAPE_RESULT JSON');
    }
  }
  
  return null;
}

/**
 * Add metrics to the aggregated totals
 */
function aggregateMetrics(aggregated: ScrapeMetrics, batch: Partial<ScrapeMetrics>): void {
  if (batch.processed !== undefined) aggregated.processed += batch.processed;
  if (batch.failed !== undefined) aggregated.failed += batch.failed;
  if (batch.filtered !== undefined) aggregated.filtered += batch.filtered;
  if (batch.cloudscraper_count !== undefined) aggregated.cloudscraper_count += batch.cloudscraper_count;
  if (batch.puppeteer_count !== undefined) aggregated.puppeteer_count += batch.puppeteer_count;
  if (batch.total_pages !== undefined) aggregated.total_pages += batch.total_pages;
  if (batch.total_bytes !== undefined) aggregated.total_bytes += batch.total_bytes;
}

/**
 * Update job metrics in DynamoDB
 */
async function updateJobMetrics(
  jobId: string,
  metrics: ScrapeMetrics,
  totalBatches: number,
  successfulBatches: number,
  failedBatches: number
): Promise<void> {
  if (!JOBS_TABLE_NAME) {
    console.warn('JOBS_TABLE_NAME not set, skipping metrics update');
    return;
  }
  
  try {
    await docClient.send(new UpdateCommand({
      TableName: JOBS_TABLE_NAME,
      Key: { job_id: jobId },
      UpdateExpression: `SET 
        #metrics.#step = :metricsVal,
        #metrics.scrape_batches = :batches,
        #metrics.scrape_batches_succeeded = :succeeded,
        #metrics.scrape_batches_failed = :failed`,
      ExpressionAttributeNames: { 
        '#metrics': 'metrics',  // 'metrics' is a DynamoDB reserved keyword
        '#step': 'scrape' 
      },
      ExpressionAttributeValues: {
        ':metricsVal': metrics,
        ':batches': totalBatches,
        ':succeeded': successfulBatches,
        ':failed': failedBatches,
      },
    }));
    console.log(`Updated job metrics for ${jobId}`);
  } catch (error) {
    console.error('Failed to update job metrics:', error);
  }
}
