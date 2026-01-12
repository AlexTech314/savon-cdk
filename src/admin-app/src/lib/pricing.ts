/**
 * Pricing Configuration for Cost Estimation
 * 
 * All prices are in USD. Last updated: 2026-01-11
 * 
 * IMPORTANT: These are estimates based on publicly available pricing.
 * Actual costs may vary based on usage tiers, regions, and billing agreements.
 * 
 * Google Maps Platform Volume Discounts:
 * - Google offers a $200/month free credit
 * - Volume discounts apply to monthly usage across all SKUs
 * - Tier 1: 0-100,000 requests/month (base price)
 * - Tier 2: 100,001-500,000 requests/month (~15% discount)
 * - Tier 3: 500,001+ requests/month (custom pricing, ~25-40% discount)
 */

// ============================================
// PRICING CONSTANTS
// ============================================

export const PRICING = {
  google: {
    // Text Search (New) - tiered pricing based on data requested
    // Each search can return up to 20 results per page
    // Pagination uses additional requests (up to 3 pages = 60 results max)
    textSearch: {
      pricePerRequest: 0.032, // Pro tier default: $32/1000
      resultsPerPage: 20,
      maxPages: 3,
      maxResultsPerQuery: 60,
      // Tiered pricing for different data levels
      tierPricing: {
        pro: 0.032,                    // $32/1000 - address, location, types
        enterprise: 0.035,             // $35/1000 - + phone, website, rating, hours
        enterprise_atmosphere: 0.040,  // $40/1000 - + reviews, atmosphere data
      },
    },
    
    // Place Details (Basic tier) - $5/1000 requests
    // Minimal fields: name, address, location
    placeDetailsBasic: 0.005,
    
    // Place Details (Contact tier) - $7/1000 requests
    // Adds: phone, website, hours
    placeDetailsContact: 0.007,
    
    // Place Details (Atmosphere tier) - $10/1000 requests
    // Adds: ratings, reviews
    placeDetailsAtmosphere: 0.010,
    
    // For our use: we request everything = Basic + Contact + Atmosphere = $0.022
    // But billed as single request at highest tier = $0.017 per Google's docs
    // Actually, new API bills per-field-mask, so let's use combined estimate
    placeDetails: 0.017, // Combined estimate for all fields we need
    
    // Place Details (Preferred Data) - additional $5/1000 for reviews/editorialSummary
    // When requesting reviews specifically
    placeDetailsReviews: 0.025, // $25/1000
    
    // Photos - $7/1000 requests
    photos: 0.007,
    
    // Volume discount tiers (cumulative monthly requests)
    volumeDiscountTiers: [
      { threshold: 0, discount: 0 },           // 0-100K: no discount
      { threshold: 100000, discount: 0.15 },   // 100K-500K: 15% off
      { threshold: 500000, discount: 0.25 },   // 500K+: 25% off (estimate)
    ],
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
// HELPER FUNCTIONS
// ============================================

/**
 * Format a cost value as USD currency
 */
export function formatCost(cost: number | undefined | null): string {
  // Handle undefined/null/NaN
  if (cost == null || isNaN(cost)) {
    return '$0.00';
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Calculate the number of API pages needed based on maxResultsPerSearch
 * Google Text Search returns up to 20 results per page, max 3 pages (60 results)
 */
export function calculatePagesNeeded(maxResultsPerSearch: number): number {
  const resultsPerPage = PRICING.google.textSearch.resultsPerPage; // 20
  const maxPages = PRICING.google.textSearch.maxPages; // 3
  
  // Cap at 60 results (Google's limit)
  const cappedResults = Math.min(maxResultsPerSearch, PRICING.google.textSearch.maxResultsPerQuery);
  
  // Calculate pages needed (ceil division)
  const pagesNeeded = Math.ceil(cappedResults / resultsPerPage);
  
  return Math.min(pagesNeeded, maxPages);
}

/**
 * Apply volume discount based on total monthly request count
 * This is an estimate - actual discounts require Google billing agreement
 */
export function applyVolumeDiscount(baseCost: number, totalMonthlyRequests: number): number {
  const tiers = PRICING.google.volumeDiscountTiers;
  
  // Find applicable tier (highest threshold that's <= total requests)
  let discount = 0;
  for (const tier of tiers) {
    if (totalMonthlyRequests >= tier.threshold) {
      discount = tier.discount;
    }
  }
  
  return baseCost * (1 - discount);
}

// ============================================
// COST ESTIMATION FUNCTIONS
// ============================================

/**
 * Estimate cost for text search operations
 * 
 * @param numSearches - Number of search queries
 * @param maxResultsPerSearch - Max results requested per search (affects pagination)
 * @param currentMonthlyRequests - Current month's request count (for volume discount)
 */
export function estimateSearchCost(
  numSearches: number,
  maxResultsPerSearch: number = 20,
  currentMonthlyRequests: number = 0
): CostBreakdown {
  const pagesPerSearch = calculatePagesNeeded(maxResultsPerSearch);
  const totalApiCalls = numSearches * pagesPerSearch;
  const unitCost = PRICING.google.textSearch.pricePerRequest;
  
  let baseCost = totalApiCalls * unitCost;
  
  // Apply volume discount if applicable
  const totalWithNew = currentMonthlyRequests + totalApiCalls;
  const discountedCost = applyVolumeDiscount(baseCost, totalWithNew);
  const discount = baseCost - discountedCost;
  
  const items: CostItem[] = [
    {
      name: 'Google Text Search API',
      cost: discountedCost,
      quantity: totalApiCalls,
      unitCost,
      description: `${numSearches} queries × ${pagesPerSearch} page(s) each`,
    },
  ];
  
  const formattedBreakdown = [
    `Search: ${formatCost(discountedCost)} (${numSearches} queries × ${pagesPerSearch} pages = ${totalApiCalls} API calls)`,
  ];
  
  if (discount > 0) {
    formattedBreakdown.push(`Volume discount applied: -${formatCost(discount)}`);
  }
  
  return {
    total: discountedCost,
    items,
    formatted: formatCost(discountedCost),
    formattedBreakdown,
  };
}

/**
 * Estimate cost for fetching place details
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
    formattedBreakdown: [`Details: ${formatCost(total)} (${count} × ${formatCost(unitCost)})`],
  };
}

/**
 * Estimate cost for fetching reviews (Preferred tier)
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
    formattedBreakdown: [`Reviews: ${formatCost(total)} (${count} × ${formatCost(unitCost)})`],
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
    formattedBreakdown: [`Photos: ${formatCost(total)} (${count} × ${formatCost(unitCost)})`],
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
    formattedBreakdown: [`Copy: ${formatCost(total)} (${count} × ${formatCost(unitCost)})`],
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
 * Pipeline step configuration for cost estimation
 */
export interface PipelineStepConfig {
  runDetails: boolean;
  runEnrich: boolean;  // Reviews
  runPhotos: boolean;
  runCopy: boolean;
}

/**
 * Extended cost breakdown with per-business and step details
 */
export interface PipelineJobCostBreakdown extends CostBreakdown {
  businessCount: number;
  perBusinessCost: number;
  perBusinessFormatted: string;
  stepBreakdown: {
    step: string;
    enabled: boolean;
    unitCost: number;
    totalCost: number;
    unitCostFormatted: string;
    totalCostFormatted: string;
    apiProvider: string;
    description: string;
  }[];
  warnings: string[];
}

/**
 * Estimate cost for running a pipeline job with selected steps
 * 
 * This provides a comprehensive breakdown including:
 * - Cost per business for each step
 * - Total cost per step
 * - Overall total
 * - Volume discount considerations
 * - Warnings for high-cost operations
 * 
 * @param businessCount - Number of businesses to process
 * @param steps - Which pipeline steps are enabled
 * @param currentMonthlyRequests - Current month's Google API requests (for volume discount)
 */
export function estimatePipelineJobCost(
  businessCount: number,
  steps: PipelineStepConfig,
  currentMonthlyRequests: number = 0
): PipelineJobCostBreakdown {
  const stepBreakdown: PipelineJobCostBreakdown['stepBreakdown'] = [];
  const warnings: string[] = [];
  let totalCost = 0;
  let totalGoogleRequests = 0;
  
  // Details step (Google Places API - $0.017/request)
  const detailsUnitCost = PRICING.google.placeDetails;
  const detailsEnabled = steps.runDetails;
  const detailsTotalCost = detailsEnabled ? businessCount * detailsUnitCost : 0;
  if (detailsEnabled) {
    totalGoogleRequests += businessCount;
  }
  stepBreakdown.push({
    step: 'Details',
    enabled: detailsEnabled,
    unitCost: detailsUnitCost,
    totalCost: detailsTotalCost,
    unitCostFormatted: formatCost(detailsUnitCost),
    totalCostFormatted: formatCost(detailsTotalCost),
    apiProvider: 'Google Places API',
    description: 'Address, phone, hours, rating, location',
  });
  totalCost += detailsTotalCost;
  
  // Reviews/Enrich step (Google Places API - $0.025/request)
  const reviewsUnitCost = PRICING.google.placeDetailsReviews;
  const reviewsEnabled = steps.runEnrich;
  const reviewsTotalCost = reviewsEnabled ? businessCount * reviewsUnitCost : 0;
  if (reviewsEnabled) {
    totalGoogleRequests += businessCount;
  }
  stepBreakdown.push({
    step: 'Reviews',
    enabled: reviewsEnabled,
    unitCost: reviewsUnitCost,
    totalCost: reviewsTotalCost,
    unitCostFormatted: formatCost(reviewsUnitCost),
    totalCostFormatted: formatCost(reviewsTotalCost),
    apiProvider: 'Google Places API',
    description: 'Reviews and editorial summary',
  });
  totalCost += reviewsTotalCost;
  
  // Photos step (Google Places API - $0.007/request)
  const photosUnitCost = PRICING.google.photos;
  const photosEnabled = steps.runPhotos;
  const photosTotalCost = photosEnabled ? businessCount * photosUnitCost : 0;
  if (photosEnabled) {
    totalGoogleRequests += businessCount;
  }
  stepBreakdown.push({
    step: 'Photos',
    enabled: photosEnabled,
    unitCost: photosUnitCost,
    totalCost: photosTotalCost,
    unitCostFormatted: formatCost(photosUnitCost),
    totalCostFormatted: formatCost(photosTotalCost),
    apiProvider: 'Google Places API',
    description: 'Photo URLs and references',
  });
  totalCost += photosTotalCost;
  
  // Copy step (Claude API)
  const copyInputCost = PRICING.claude.avgInputTokens * PRICING.claude.inputPerToken;
  const copyOutputCost = PRICING.claude.avgOutputTokens * PRICING.claude.outputPerToken;
  const copyUnitCost = copyInputCost + copyOutputCost;
  const copyEnabled = steps.runCopy;
  const copyTotalCost = copyEnabled ? businessCount * copyUnitCost : 0;
  stepBreakdown.push({
    step: 'Copy',
    enabled: copyEnabled,
    unitCost: copyUnitCost,
    totalCost: copyTotalCost,
    unitCostFormatted: formatCost(copyUnitCost),
    totalCostFormatted: formatCost(copyTotalCost),
    apiProvider: 'Anthropic Claude',
    description: `~${PRICING.claude.avgInputTokens + PRICING.claude.avgOutputTokens} tokens per business`,
  });
  totalCost += copyTotalCost;
  
  // Apply volume discount to Google API costs
  const googleCostBeforeDiscount = detailsTotalCost + reviewsTotalCost + photosTotalCost;
  const totalWithNewRequests = currentMonthlyRequests + totalGoogleRequests;
  const googleCostAfterDiscount = applyVolumeDiscount(googleCostBeforeDiscount, totalWithNewRequests);
  const volumeDiscount = googleCostBeforeDiscount - googleCostAfterDiscount;
  
  // Adjust total with volume discount
  const finalTotal = totalCost - volumeDiscount;
  
  // Calculate per-business cost
  const perBusinessCost = businessCount > 0 ? finalTotal / businessCount : 0;
  
  // Generate warnings
  if (businessCount > 1000) {
    warnings.push(`Large job: ${businessCount.toLocaleString()} businesses will be processed`);
  }
  if (finalTotal > 50) {
    warnings.push(`Estimated cost exceeds $50`);
  }
  if (finalTotal > 100) {
    warnings.push(`High cost alert: Consider running in smaller batches`);
  }
  if (totalWithNewRequests > 100000 && volumeDiscount > 0) {
    warnings.push(`Volume discount applied: -${formatCost(volumeDiscount)} (15% off Google API)`);
  }
  
  // Build formatted breakdown
  const formattedBreakdown: string[] = [
    `Businesses: ${businessCount.toLocaleString()}`,
    '',
  ];
  
  for (const step of stepBreakdown) {
    if (step.enabled) {
      formattedBreakdown.push(
        `${step.step}: ${step.totalCostFormatted} (${businessCount.toLocaleString()} × ${step.unitCostFormatted})`
      );
    }
  }
  
  if (volumeDiscount > 0) {
    formattedBreakdown.push('');
    formattedBreakdown.push(`Volume discount: -${formatCost(volumeDiscount)}`);
  }
  
  // Build items array
  const items: CostItem[] = stepBreakdown
    .filter(s => s.enabled)
    .map(s => ({
      name: `${s.step} (${s.apiProvider})`,
      cost: s.totalCost,
      quantity: businessCount,
      unitCost: s.unitCost,
      description: s.description,
    }));
  
  return {
    total: finalTotal,
    items,
    formatted: formatCost(finalTotal),
    formattedBreakdown,
    businessCount,
    perBusinessCost,
    perBusinessFormatted: formatCost(perBusinessCost),
    stepBreakdown,
    warnings,
  };
}

type DataTier = 'pro' | 'enterprise' | 'enterprise_atmosphere';

const TIER_LABELS: Record<DataTier, string> = {
  pro: 'Pro',
  enterprise: 'Enterprise',
  enterprise_atmosphere: 'Enterprise + Atmosphere',
};

/**
 * Estimate cost for a campaign run
 * 
 * Campaigns perform Text Search at the specified data tier.
 * Higher tiers cost more but include more data per request.
 * 
 * @param numSearches - Number of search queries in the campaign
 * @param maxResultsPerSearch - Max results per search (affects pagination)
 * @param dataTier - Data tier: 'pro' ($32), 'enterprise' ($35), or 'enterprise_atmosphere' ($40)
 * @param currentMonthlyRequests - Current monthly requests for volume discount
 */
export function estimateCampaignCost(
  numSearches: number | undefined,
  maxResultsPerSearch: number | undefined,
  dataTier: DataTier = 'enterprise',
  currentMonthlyRequests: number = 0
): CostBreakdown {
  // Defensive: ensure we have valid numbers
  const safeNumSearches = typeof numSearches === 'number' ? numSearches : 0;
  const safeMaxResults = typeof maxResultsPerSearch === 'number' ? maxResultsPerSearch : 60;
  
  const pagesPerSearch = calculatePagesNeeded(safeMaxResults);
  const totalApiCalls = safeNumSearches * pagesPerSearch;
  const estimatedResults = Math.min(safeNumSearches * safeMaxResults, safeNumSearches * 60);
  
  // Get tier-specific pricing
  const tierPricing = PRICING.google.textSearch.tierPricing as Record<DataTier, number>;
  const unitCost = tierPricing[dataTier] || tierPricing.enterprise;
  
  let baseCost = totalApiCalls * unitCost;
  
  // Apply volume discount if applicable
  const totalWithNew = currentMonthlyRequests + totalApiCalls;
  let discount = 0;
  if (totalWithNew > 5000000) discount = 0.20;
  else if (totalWithNew > 1000000) discount = 0.15;
  else if (totalWithNew > 500000) discount = 0.10;
  else if (totalWithNew > 100000) discount = 0.05;
  
  const discountedCost = baseCost * (1 - discount);
  
  const items = [{
    name: `Text Search (${TIER_LABELS[dataTier]})`,
    count: totalApiCalls,
    unitCost,
    subtotal: discountedCost,
  }];
  
  const formattedBreakdown = [
    `Data Tier: ${TIER_LABELS[dataTier]} ($${(unitCost * 1000).toFixed(0)}/1000)`,
    `Queries: ${safeNumSearches.toLocaleString()}`,
    `Max results/query: ${safeMaxResults} (${pagesPerSearch} page${pagesPerSearch > 1 ? 's' : ''})`,
    `Total API calls: ${totalApiCalls.toLocaleString()}`,
    `Est. businesses found: up to ${estimatedResults.toLocaleString()}`,
  ];
  
  if (discount > 0) {
    formattedBreakdown.push(`Volume discount: ${(discount * 100).toFixed(0)}% off`);
  }
  
  // Add info about what's included
  if (dataTier === 'enterprise_atmosphere') {
    formattedBreakdown.push('', '✓ Includes: Details + Reviews (no separate calls needed)');
  } else if (dataTier === 'enterprise') {
    formattedBreakdown.push('', '✓ Includes: Details (Reviews still need separate call)');
  }
  
  return {
    total: discountedCost,
    items,
    formatted: formatCost(discountedCost),
    formattedBreakdown,
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

