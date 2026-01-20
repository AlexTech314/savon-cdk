import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, BUSINESSES_TABLE_NAME, JOBS_TABLE_NAME } from '../config.js';
import type { FilterRule, Business, ExtractedData, ScrapeMetrics } from '../types.js';

/**
 * Build a DynamoDB filter expression from filter rules
 */
export function buildFilterFromRules(
  rules: FilterRule[],
  baseExpression: string,
  existingNames: Record<string, string> = {},
  existingValues: Record<string, unknown> = {}
): {
  expression: string;
  names: Record<string, string>;
  values: Record<string, unknown>;
} {
  const names = { ...existingNames };
  const values = { ...existingValues };
  const conditions: string[] = baseExpression ? [baseExpression] : [];
  
  rules.forEach((rule, index) => {
    const fieldAlias = `#filterField${index}`;
    const valueAlias = `:filterVal${index}`;
    names[fieldAlias] = rule.field;
    
    switch (rule.operator) {
      case 'EXISTS':
        conditions.push(`attribute_exists(${fieldAlias})`);
        break;
      case 'NOT_EXISTS':
        conditions.push(`attribute_not_exists(${fieldAlias})`);
        break;
      case 'EQUALS':
        values[valueAlias] = rule.value;
        conditions.push(`${fieldAlias} = ${valueAlias}`);
        break;
      case 'NOT_EQUALS':
        values[valueAlias] = rule.value;
        conditions.push(`${fieldAlias} <> ${valueAlias}`);
        break;
    }
  });
  
  return {
    expression: conditions.join(' AND '),
    names,
    values,
  };
}

/**
 * Get businesses that need to be scraped based on filters
 */
export async function getBusinessesToScrape(
  placeIds?: string[],
  filterRules: FilterRule[] = [],
  skipIfDone: boolean = true,
  forceRescrape: boolean = false
): Promise<Business[]> {
  const businesses: Business[] = [];
  let lastKey: Record<string, unknown> | undefined;
  
  // Base filter: must have website_uri
  let baseExpression = 'attribute_exists(website_uri)';
  const baseValues: Record<string, unknown> = {};
  
  if (skipIfDone && !forceRescrape) {
    baseExpression += ' AND (attribute_not_exists(web_scraped) OR web_scraped = :false)';
    baseValues[':false'] = false;
  }
  
  // Build filter with rules
  const { expression, names, values } = buildFilterFromRules(
    filterRules,
    placeIds ? '' : baseExpression,
    {},
    placeIds ? {} : baseValues
  );
  
  do {
    const command = new ScanCommand({
      TableName: BUSINESSES_TABLE_NAME,
      FilterExpression: expression || undefined,
      ExpressionAttributeNames: Object.keys(names).length > 0 ? names : undefined,
      ExpressionAttributeValues: Object.keys(values).length > 0 ? values : undefined,
      ExclusiveStartKey: lastKey,
    });
    
    const result = await docClient.send(command);
    const items = (result.Items || []) as Business[];
    
    if (placeIds) {
      // Filter to specific IDs and apply base conditions
      businesses.push(...items.filter(b => {
        if (!placeIds.includes(b.place_id)) return false;
        if (!b.website_uri) return false;
        if (skipIfDone && !forceRescrape && b.web_scraped) return false;
        return true;
      }));
    } else {
      businesses.push(...items);
    }
    
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  return businesses;
}

/**
 * Update a business record with scrape results
 */
export async function updateBusinessWithScrapeData(
  placeId: string,
  rawS3Key: string,
  extractedS3Key: string,
  scrapeMethod: 'cloudscraper' | 'puppeteer',
  pagesCount: number,
  totalBytes: number,
  durationMs: number,
  errors: number,
  extracted: ExtractedData
): Promise<void> {
  const updateFields: Record<string, unknown> = {
    // Core scrape status
    web_scraped: true,
    web_scraped_str: 'true', // String version for GSI
    web_scraped_at: new Date().toISOString(),
    
    // S3 references
    web_raw_s3_key: rawS3Key,
    web_extracted_s3_key: extractedS3Key,
    
    // Scrape metadata
    web_pages_count: pagesCount,
    web_scrape_method: scrapeMethod,
    web_total_bytes: totalBytes,
    web_scrape_duration_ms: durationMs,
    web_scrape_errors: errors,
    web_scrape_status: errors === 0 ? 'complete' : (pagesCount > 0 ? 'partial' : 'failed'),
    
    // Contact information
    web_emails: extracted.emails,
    web_phones: extracted.phones,
    web_contact_page: extracted.contact_page_url,
    web_social_linkedin: extracted.social.linkedin || null,
    web_social_facebook: extracted.social.facebook || null,
    web_social_instagram: extracted.social.instagram || null,
    web_social_twitter: extracted.social.twitter || null,
    
    // Team/employee data
    web_team_members: extracted.team_members.length > 0 ? JSON.stringify(extracted.team_members) : null,
    web_team_count: extracted.team_members.length,
    web_headcount_estimate: extracted.headcount_estimate,
    web_headcount_source: extracted.headcount_source,
    web_new_hires: extracted.new_hire_mentions.length > 0 ? JSON.stringify(extracted.new_hire_mentions) : null,
    web_has_team_page: extracted.team_members.length > 0,
    
    // Acquisition signals
    web_acquisition_signals: extracted.acquisition_signals.length > 0 ? JSON.stringify(extracted.acquisition_signals) : null,
    web_has_acquisition_signal: extracted.has_acquisition_signal,
    web_ownership_note: extracted.acquisition_summary,
    
    // Business history
    web_founded_year: extracted.founded_year,
    web_founded_source: extracted.founded_source,
    web_years_in_business: extracted.years_in_business,
    web_history_snippets: extracted.history_snippets.length > 0 ? JSON.stringify(extracted.history_snippets) : null,
    
    // Pipeline status
    pipeline_status: 'scraped',
  };
  
  // Build update expression
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
  
  try {
    await docClient.send(new UpdateCommand({
      TableName: BUSINESSES_TABLE_NAME,
      Key: { place_id: placeId },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
    }));
    console.log(`  [DynamoDB] Updated ${placeId} with ${updateParts.length} fields`);
  } catch (error) {
    console.error(`  [DynamoDB ERROR] Failed to update ${placeId}:`, error);
    throw error;
  }
}

/**
 * Mark a business as failed to scrape
 */
export async function markBusinessScrapeFailed(placeId: string): Promise<void> {
  try {
    await docClient.send(new UpdateCommand({
      TableName: BUSINESSES_TABLE_NAME,
      Key: { place_id: placeId },
      UpdateExpression: 'SET web_scraped = :true, web_scraped_str = :trueStr, web_scrape_status = :status, web_scraped_at = :at',
      ExpressionAttributeValues: {
        ':true': true,
        ':trueStr': 'true', // String version for GSI
        ':status': 'failed',
        ':at': new Date().toISOString(),
      },
    }));
    console.log(`  Updated ${placeId} with failed status`);
  } catch (updateError) {
    console.error(`  Failed to update failed status for ${placeId}:`, updateError);
  }
}

/**
 * Update job metrics in DynamoDB
 */
export async function updateJobMetrics(
  jobId: string, 
  metrics: ScrapeMetrics
): Promise<void> {
  if (!JOBS_TABLE_NAME) {
    console.warn('JOBS_TABLE_NAME not set, skipping metrics update');
    return;
  }
  
  try {
    await docClient.send(new UpdateCommand({
      TableName: JOBS_TABLE_NAME,
      Key: { job_id: jobId },
      UpdateExpression: 'SET #metrics.#step = :metricsVal',
      ExpressionAttributeNames: { 
        '#metrics': 'metrics',  // 'metrics' is a DynamoDB reserved keyword
        '#step': 'scrape' 
      },
      ExpressionAttributeValues: { ':metricsVal': metrics },
    }));
    console.log(`Updated job metrics for ${jobId}`);
  } catch (error) {
    console.error('Failed to update job metrics:', error);
  }
}
