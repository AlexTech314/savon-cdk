/**
 * Pricing Configuration for Cost Estimation
 * 
 * All prices are in USD. Last updated: 2026-01-11
 * 
 * IMPORTANT: These are estimates based on publicly available pricing.
 * Actual costs may vary based on usage tiers, regions, and billing agreements.
 */

// ============================================
// PRICING CONSTANTS
// ============================================

export const PRICING = {
  google: {
    // Text Search (Pro tier) - $32/1000 requests
    textSearch: 0.032,
    
    // Place Details (Advanced tier) - $20/1000 requests
    // Includes: address, phone, hours, rating, website, location
    placeDetails: 0.020,
    
    // Place Details (Preferred tier) - $25/1000 requests
    // Includes: reviews, editorialSummary (adds $5 to Advanced)
    placeDetailsReviews: 0.025,
    
    // Photos - $7/1000 requests
    photos: 0.007,
    
    // Free monthly quota (per SKU)
    freeMonthly: 10000,
  },
  
  claude: {
    // Claude Sonnet 4 pricing
    inputPerToken: 0.000003,   // $3/1M tokens
    outputPerToken: 0.000015,  // $15/1M tokens
    
    // Average tokens per copy generation (estimated)
    avgInputTokens: 2000,
    avgOutputTokens: 1500,
  },
  
  aws: {
    // Lambda - $0.20 per 1M requests
    lambdaPerRequest: 0.0000002,
    
    // Lambda duration - $0.0000166667 per GB-second
    lambdaPerGbSecond: 0.0000166667,
    
    // Fargate - $0.04048 per vCPU-hour
    fargateVcpuHour: 0.04048,
    
    // Fargate - $0.004445 per GB-hour
    fargateGbHour: 0.004445,
    
    // DynamoDB On-Demand - $0.625 per 1M write request units
    dynamoWritePer: 0.000000625,
    
    // DynamoDB On-Demand - $0.125 per 1M read request units
    dynamoReadPer: 0.000000125,
  },
  
  // Source documentation for all pricing
  sources: [
    {
      name: 'Google Maps Platform Pricing',
      url: 'https://developers.google.com/maps/billing-and-pricing/pricing',
      updated: '2026-01-11',
      description: 'Text Search, Place Details, and Photos API pricing',
    },
    {
      name: 'Anthropic Claude Pricing',
      url: 'https://www.anthropic.com/pricing',
      updated: '2026-01-11',
      description: 'Claude Sonnet 4 token-based pricing',
    },
    {
      name: 'AWS Lambda Pricing',
      url: 'https://aws.amazon.com/lambda/pricing/',
      updated: '2026-01-11',
      description: 'Request and duration-based pricing',
    },
    {
      name: 'AWS Fargate Pricing',
      url: 'https://aws.amazon.com/fargate/pricing/',
      updated: '2026-01-11',
      description: 'vCPU and memory hourly pricing',
    },
    {
      name: 'AWS DynamoDB Pricing',
      url: 'https://aws.amazon.com/dynamodb/pricing/on-demand/',
      updated: '2026-01-11',
      description: 'On-demand read/write request pricing',
    },
  ],
} as const;

// ============================================
// TYPES
// ============================================

export interface CostBreakdown {
  total: number;
  items: CostItem[];
  formatted: string;
  formattedBreakdown: string[];
}

export interface CostItem {
  name: string;
  cost: number;
  quantity: number;
  unitCost: number;
  description?: string;
}

export interface PricingSource {
  name: string;
  url: string;
  updated: string;
  description: string;
}

// ============================================
// COST ESTIMATION FUNCTIONS
// ============================================

/**
 * Format a cost value as USD currency
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Estimate cost for fetching place details (Enterprise tier)
 * Includes: address, phone, hours, rating, website, location
 */
export function estimateDetailsCost(count: number): CostBreakdown {
  const unitCost = PRICING.google.placeDetails;
  const total = count * unitCost;
  
  return {
    total,
    items: [
      {
        name: 'Google Place Details',
        cost: total,
        quantity: count,
        unitCost,
        description: 'Address, phone, hours, rating, location',
      },
    ],
    formatted: formatCost(total),
    formattedBreakdown: [`Details: ${formatCost(total)} (${count} x ${formatCost(unitCost)})`],
  };
}

/**
 * Estimate cost for fetching reviews (Enterprise + Atmosphere tier)
 */
export function estimateReviewsCost(count: number): CostBreakdown {
  const unitCost = PRICING.google.placeDetailsReviews;
  const total = count * unitCost;
  
  return {
    total,
    items: [
      {
        name: 'Google Place Reviews',
        cost: total,
        quantity: count,
        unitCost,
        description: 'Reviews and editorial summary',
      },
    ],
    formatted: formatCost(total),
    formattedBreakdown: [`Reviews: ${formatCost(total)} (${count} x ${formatCost(unitCost)})`],
  };
}

/**
 * Estimate cost for fetching photos
 */
export function estimatePhotosCost(count: number): CostBreakdown {
  const unitCost = PRICING.google.photos;
  const total = count * unitCost;
  
  return {
    total,
    items: [
      {
        name: 'Google Place Photos',
        cost: total,
        quantity: count,
        unitCost,
        description: 'Photo references and media URLs',
      },
    ],
    formatted: formatCost(total),
    formattedBreakdown: [`Photos: ${formatCost(total)} (${count} x ${formatCost(unitCost)})`],
  };
}

/**
 * Estimate cost for LLM copy generation
 */
export function estimateCopyCost(count: number): CostBreakdown {
  const inputCost = PRICING.claude.avgInputTokens * PRICING.claude.inputPerToken;
  const outputCost = PRICING.claude.avgOutputTokens * PRICING.claude.outputPerToken;
  const unitCost = inputCost + outputCost;
  const total = count * unitCost;
  
  return {
    total,
    items: [
      {
        name: 'Claude Sonnet 4',
        cost: total,
        quantity: count,
        unitCost,
        description: `~${PRICING.claude.avgInputTokens} input + ~${PRICING.claude.avgOutputTokens} output tokens`,
      },
    ],
    formatted: formatCost(total),
    formattedBreakdown: [`Copy: ${formatCost(total)} (${count} x ${formatCost(unitCost)})`],
  };
}

/**
 * Estimate cost for text search
 */
export function estimateSearchCost(count: number): CostBreakdown {
  const unitCost = PRICING.google.textSearch;
  const total = count * unitCost;
  
  return {
    total,
    items: [
      {
        name: 'Google Text Search',
        cost: total,
        quantity: count,
        unitCost,
        description: 'Place search results',
      },
    ],
    formatted: formatCost(total),
    formattedBreakdown: [`Search: ${formatCost(total)} (${count} x ${formatCost(unitCost)})`],
  };
}

/**
 * Estimate cost for full pipeline (details + reviews + copy)
 * This is the typical cost for generating a preview for a business
 */
export function estimatePipelineCost(count: number): CostBreakdown {
  const detailsCost = estimateDetailsCost(count);
  const reviewsCost = estimateReviewsCost(count);
  const copyCost = estimateCopyCost(count);
  
  const total = detailsCost.total + reviewsCost.total + copyCost.total;
  
  return {
    total,
    items: [
      ...detailsCost.items,
      ...reviewsCost.items,
      ...copyCost.items,
    ],
    formatted: formatCost(total),
    formattedBreakdown: [
      ...detailsCost.formattedBreakdown,
      ...reviewsCost.formattedBreakdown,
      ...copyCost.formattedBreakdown,
    ],
  };
}

/**
 * Estimate cost for a campaign run
 * Assumes: search + details + reviews + copy for each result
 */
export function estimateCampaignCost(
  numSearches: number,
  maxResultsPerSearch: number
): CostBreakdown {
  const estimatedResults = numSearches * Math.min(maxResultsPerSearch, 60);
  
  const searchCost = estimateSearchCost(numSearches);
  const pipelineCost = estimatePipelineCost(estimatedResults);
  
  const total = searchCost.total + pipelineCost.total;
  
  return {
    total,
    items: [
      ...searchCost.items,
      ...pipelineCost.items,
    ],
    formatted: formatCost(total),
    formattedBreakdown: [
      `Searches: ${numSearches} queries`,
      `Est. results: ${estimatedResults} businesses`,
      '',
      ...searchCost.formattedBreakdown,
      ...pipelineCost.formattedBreakdown,
    ],
  };
}

/**
 * Get unit cost for a single business through full pipeline
 */
export function getPerBusinessCost(): number {
  return estimatePipelineCost(1).total;
}

/**
 * Get all pricing sources
 */
export function getPricingSources(): PricingSource[] {
  return PRICING.sources as unknown as PricingSource[];
}
