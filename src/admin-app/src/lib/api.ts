/**
 * API Layer for Savon Control Center
 * 
 * Real API calls to api-alpha.savondesigns.com
 */

import { 
  Business, 
  Job, 
  PaginatedResponse, 
  BusinessFilters, 
  ImportResult 
} from './types';
import { Campaign, CampaignInput } from '@/types/jobs';
import { getIdToken } from './auth';
import { API_BASE_URL } from './amplify-config';

// ============================================
// API CLIENT HELPERS
// ============================================

interface FetchOptions extends RequestInit {
  requiresAuth?: boolean;
}

async function apiClient<T>(
  endpoint: string, 
  options: FetchOptions = {}
): Promise<T> {
  const { requiresAuth = false, ...fetchOptions } = options;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
  };
  
  // Add auth header for protected routes
  if (requiresAuth) {
    const token = await getIdToken();
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  }
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.message || 'API request failed');
  }
  
  // Handle CSV responses
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('text/csv')) {
    return await response.text() as unknown as T;
  }
  
  return response.json();
}

// ============================================
// BUSINESS API
// ============================================

interface BackendBusiness {
  place_id: string;
  business_name: string;
  business_type: string;
  address: string;
  city: string;
  state: string;
  phone?: string;
  friendly_slug?: string;
  rating?: number;
  rating_count?: number;
  copy_generated?: boolean;
  created_at?: string;
  updated_at?: string;
  // Pipeline status flags
  searched?: boolean;
  details_fetched?: boolean;
  reviews_fetched?: boolean;
  photos_fetched?: boolean;
  has_website?: boolean;
  website_uri?: string;
  [key: string]: unknown;
}

function transformBusiness(b: BackendBusiness): Business {
  return {
    place_id: b.place_id,
    name: b.business_name,
    business_type: b.business_type,
    address: b.address,
    city: b.city,
    state: b.state,
    phone: b.phone || '',
    website: b.website_uri,
    friendly_slug: b.friendly_slug || '',
    rating: b.rating,
    review_count: b.rating_count,
    created_at: b.created_at || new Date().toISOString(),
    updated_at: b.updated_at || new Date().toISOString(),
    generated_copy: b.copy_generated ? {
      headline: (b.copy_hero_headline as string) || '',
      tagline: (b.copy_hero_subheadline as string) || '',
      services: [],
      about: '',
    } : undefined,
    // Pipeline status flags
    searched: b.searched,
    details_fetched: b.details_fetched,
    reviews_fetched: b.reviews_fetched,
    photos_fetched: b.photos_fetched,
    copy_generated: b.copy_generated,
    has_website: b.has_website,
  };
}

export const getBusinesses = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  filters?: BusinessFilters;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<PaginatedResponse<Business>> => {
  const { page = 1, limit = 20, search } = params;
  
  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));
  if (search) {
    queryParams.set('q', search);
  }
  
  const response = await apiClient<{
    items: BackendBusiness[];
    count: number;
    page: number;
    limit: number;
  }>(`/businesses?${queryParams.toString()}`);
  
  const data = response.items.map(transformBusiness);
  
  // Apply client-side filtering if needed (API does basic search)
  let filtered = data;
  const filters = params.filters;
  if (filters?.business_type) {
    filtered = filtered.filter(b => b.business_type === filters.business_type);
  }
  if (filters?.state) {
    filtered = filtered.filter(b => b.state === filters.state);
  }
  if (filters?.has_copy !== null && filters?.has_copy !== undefined) {
    filtered = filtered.filter(b => filters.has_copy ? !!b.generated_copy : !b.generated_copy);
  }
  // Pipeline status filtering
  if (filters?.pipeline_status) {
    filtered = filtered.filter(b => {
      switch (filters.pipeline_status) {
        case 'searched':
          return b.searched && !b.details_fetched;
        case 'details':
          return b.details_fetched && !b.reviews_fetched;
        case 'reviews':
          return b.reviews_fetched && !b.copy_generated;
        case 'photos':
          return b.photos_fetched;
        case 'copy':
        case 'complete':
          return b.copy_generated;
        case 'has_website':
          return b.has_website;
        default:
          return true;
      }
    });
  }
  if (filters?.has_website !== null && filters?.has_website !== undefined) {
    filtered = filtered.filter(b => filters.has_website ? b.has_website : !b.has_website);
  }
  
  // Apply sorting
  if (params.sortBy) {
    filtered.sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[params.sortBy!] || '';
      const bVal = (b as Record<string, unknown>)[params.sortBy!] || '';
      const comparison = String(aVal).localeCompare(String(bVal));
      return params.sortOrder === 'desc' ? -comparison : comparison;
    });
  }
  
  return { 
    data: filtered, 
    total: response.count, 
    page: response.page, 
    limit: response.limit, 
    totalPages: Math.ceil(response.count / response.limit) 
  };
};

export const getBusiness = async (place_id: string): Promise<Business | null> => {
  try {
    const response = await apiClient<BackendBusiness>(`/businesses/${encodeURIComponent(place_id)}`);
    return transformBusiness(response);
  } catch {
    return null;
  }
};

export const updateBusiness = async (
  place_id: string, 
  data: Partial<Business>
): Promise<Business> => {
  // Transform frontend format to backend format
  const backendData: Partial<BackendBusiness> = {
    business_name: data.name,
    business_type: data.business_type,
    address: data.address,
    city: data.city,
    state: data.state,
    phone: data.phone,
  };
  
  const response = await apiClient<BackendBusiness>(
    `/businesses/${encodeURIComponent(place_id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(backendData),
      requiresAuth: true,
    }
  );
  
  return transformBusiness(response);
};

export const deleteBusiness = async (place_id: string): Promise<boolean> => {
  try {
    await apiClient(`/businesses/${encodeURIComponent(place_id)}`, {
      method: 'DELETE',
      requiresAuth: true,
    });
    return true;
  } catch {
    return false;
  }
};

export const deleteBusinesses = async (place_ids: string[]): Promise<number> => {
  // Delete one by one (backend doesn't support bulk delete)
  let deleted = 0;
  for (const id of place_ids) {
    if (await deleteBusiness(id)) {
      deleted++;
    }
  }
  return deleted;
};

export const importBusinesses = async (csvData: string): Promise<ImportResult> => {
  const response = await apiClient<{ success: boolean; imported: number; message?: string }>(
    '/businesses/import',
    {
      method: 'POST',
      body: csvData,
      headers: { 'Content-Type': 'text/csv' },
      requiresAuth: true,
    }
  );
  
  return {
    success: response.success,
    imported: response.imported,
    failed: 0,
  };
};

export const exportBusinesses = async (_filters?: BusinessFilters): Promise<string> => {
  return apiClient<string>('/businesses/export', { requiresAuth: true });
};

// ============================================
// JOB API
// ============================================

interface BackendJob {
  job_id: string;
  job_type: 'places';
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
  campaign_id: string;
  campaign_name?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  input?: {
    campaignId: string;
    jobType: 'places';
    searches: { textQuery: string; includedType?: string }[];
    maxResultsPerSearch: number;
    onlyWithoutWebsite: boolean;
  };
  error?: string;
  execution_arn?: string;
}

function transformJob(j: BackendJob): Job {
  return {
    job_id: j.job_id,
    job_type: j.job_type,
    status: j.status === 'TIMED_OUT' || j.status === 'ABORTED' ? 'FAILED' : j.status,
    campaign_id: j.campaign_id,
    campaign_name: j.campaign_name,
    created_at: j.created_at,
    started_at: j.started_at,
    completed_at: j.completed_at,
    input: j.input,
    error: j.error,
  };
}

export const getJobs = async (params: {
  page?: number;
  limit?: number;
  status?: Job['status'];
}): Promise<PaginatedResponse<Job>> => {
  const { page = 1, limit = 20, status } = params;
  
  const queryParams = new URLSearchParams();
  queryParams.set('limit', String(limit));
  if (status) {
    queryParams.set('status', status);
  }
  
  const response = await apiClient<{ jobs: BackendJob[]; count: number }>(
    `/jobs?${queryParams.toString()}`,
    { requiresAuth: true }
  );
  
  const jobs = response.jobs.map(transformJob);
  
  return { 
    data: jobs, 
    total: response.count, 
    page, 
    limit, 
    totalPages: Math.ceil(response.count / limit) 
  };
};

export const getJob = async (job_id: string): Promise<Job | null> => {
  try {
    const response = await apiClient<BackendJob>(
      `/jobs/${encodeURIComponent(job_id)}`,
      { requiresAuth: true }
    );
    return transformJob(response);
  } catch {
    return null;
  }
};

// Start a job from a campaign
export interface StartJobOptions {
  campaignId: string;
  skipCachedSearches?: boolean; // Default true - skip searches run in last 30 days
}

export const startJob = async (options: StartJobOptions): Promise<Job> => {
  const { campaignId, skipCachedSearches = true } = options;
  const response = await apiClient<{ job: BackendJob; message: string }>(
    '/jobs',
    {
      method: 'POST',
      body: JSON.stringify({ campaignId, skipCachedSearches }),
      requiresAuth: true,
    }
  );

  return transformJob(response.job);
};

// ============================================
// PIPELINE JOBS API
// ============================================

export interface PipelineFilterRule {
  field: string;
  operator: 'EXISTS' | 'NOT_EXISTS' | 'EQUALS' | 'NOT_EQUALS';
  value?: string;
}

export interface StartPipelineJobOptions {
  runDetails: boolean;
  runEnrich: boolean;
  runPhotos: boolean;
  runCopy: boolean;
  skipWithWebsite?: boolean;
  filterRules?: PipelineFilterRule[];
}

/**
 * Start a pipeline job that processes existing businesses
 * (as opposed to a campaign job which searches for new ones)
 */
export const startPipelineJob = async (options: StartPipelineJobOptions): Promise<Job> => {
  const response = await apiClient<{ job: BackendJob; message: string }>(
    '/jobs',
    {
      method: 'POST',
      body: JSON.stringify({
        jobType: 'pipeline',
        ...options,
      }),
      requiresAuth: true,
    }
  );
  
  return transformJob(response.job);
};

// ============================================
// STATS API
// ============================================

export interface TimeSeriesPoint {
  date: string;
  count: number;
}

export interface DashboardStats {
  totalBusinesses: number;
  businessesMissingCopy: number;
  activeJobs: number;
  lastJobRun: string | null;
  businessesOverTime: TimeSeriesPoint[];
  jobsOverTime: TimeSeriesPoint[];
}

export const getStats = async (): Promise<DashboardStats> => {
  // Fetch businesses count
  const businessesResponse = await apiClient<{ items: BackendBusiness[]; count: number }>(
    '/businesses?limit=1'
  );
  
  // Fetch jobs
  const jobsResponse = await apiClient<{ jobs: BackendJob[]; count: number }>(
    '/jobs?limit=50',
    { requiresAuth: true }
  );
  
  const runningJobs = jobsResponse.jobs.filter(j => j.status === 'RUNNING');
  const lastCompletedJob = jobsResponse.jobs.find(j => j.completed_at);
  
  // For businessesMissingCopy, we'd need to scan all - approximate for now
  // In production, add a dedicated stats endpoint
  const missingCopyCount = Math.floor(businessesResponse.count * 0.3); // Estimate
  
  // Generate time-series data from jobs (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });
  
  // Count jobs per day
  const jobsByDay = new Map<string, number>();
  last7Days.forEach(d => jobsByDay.set(d, 0));
  jobsResponse.jobs.forEach(job => {
    const jobDate = job.created_at.split('T')[0];
    if (jobsByDay.has(jobDate)) {
      jobsByDay.set(jobDate, (jobsByDay.get(jobDate) || 0) + 1);
    }
  });
  
  const jobsOverTime: TimeSeriesPoint[] = last7Days.map(date => ({
    date,
    count: jobsByDay.get(date) || 0,
  }));
  
  // For businesses, we don't have created_at in the API, so use cumulative mock for now
  // TODO: Add created_at to businesses table and track actual creation dates
  const totalBiz = businessesResponse.count;
  const businessesOverTime: TimeSeriesPoint[] = last7Days.map((date, i) => ({
    date,
    count: Math.max(0, Math.floor(totalBiz * ((i + 1) / 7) + (Math.random() - 0.5) * 2)),
  }));
  // Ensure last day matches actual total
  if (businessesOverTime.length > 0) {
    businessesOverTime[businessesOverTime.length - 1].count = totalBiz;
  }
  
  return {
    totalBusinesses: businessesResponse.count,
    businessesMissingCopy: missingCopyCount,
    activeJobs: runningJobs.length,
    lastJobRun: lastCompletedJob?.completed_at || null,
    businessesOverTime,
    jobsOverTime,
  };
};

// ============================================
// GENERATE PREVIEW (COPY) API
// ============================================

export const generateCopy = async (place_id: string): Promise<Business> => {
  // Quick generate preview for a single business
  const response = await apiClient<BackendBusiness>(
    `/businesses/${encodeURIComponent(place_id)}/generate-copy`,
    {
      method: 'POST',
      requiresAuth: true,
    }
  );
  
  return transformBusiness(response);
};

// ============================================
// PIPELINE API (Details, Reviews, Photos)
// ============================================

export const generateDetails = async (place_id: string): Promise<Business> => {
  // Fetch business details from Google Places API
  const response = await apiClient<BackendBusiness>(
    `/businesses/${encodeURIComponent(place_id)}/generate-details`,
    {
      method: 'POST',
      requiresAuth: true,
    }
  );
  
  return transformBusiness(response);
};

export const generateReviews = async (place_id: string): Promise<Business> => {
  // Fetch reviews from Google Places API
  const response = await apiClient<BackendBusiness>(
    `/businesses/${encodeURIComponent(place_id)}/generate-reviews`,
    {
      method: 'POST',
      requiresAuth: true,
    }
  );
  
  return transformBusiness(response);
};

export const generatePhotos = async (place_id: string): Promise<Business> => {
  // Fetch photos from Google Places API
  const response = await apiClient<BackendBusiness>(
    `/businesses/${encodeURIComponent(place_id)}/generate-photos`,
    {
      method: 'POST',
      requiresAuth: true,
    }
  );
  
  return transformBusiness(response);
};

/**
 * Run the full pipeline for a business:
 * 1. Fetch details (if not already done)
 * 2. Fetch reviews (if not already done)
 * 3. Generate copy
 * 
 * Returns the updated business after each step.
 */
export const generateFullPipeline = async (
  place_id: string,
  onProgress?: (step: string, business: Business) => void
): Promise<Business> => {
  let business: Business;
  
  // Step 1: Get details if not already fetched
  onProgress?.('Fetching details...', { place_id } as Business);
  business = await generateDetails(place_id);
  onProgress?.('Details fetched', business);
  
  // If business has a website, we might want to skip copy generation
  if (business.has_website) {
    onProgress?.('Business has website - skipping copy', business);
    return business;
  }
  
  // Step 2: Get reviews if not already fetched
  onProgress?.('Fetching reviews...', business);
  business = await generateReviews(place_id);
  onProgress?.('Reviews fetched', business);
  
  // Step 3: Generate copy
  onProgress?.('Generating copy...', business);
  business = await generateCopy(place_id);
  onProgress?.('Copy generated', business);
  
  return business;
};

export const generateCopyBulk = async (place_ids: string[]): Promise<number> => {
  // Generate previews for multiple businesses
  // This would trigger a background job or sequential generation
  let generated = 0;
  for (const id of place_ids) {
    try {
      await generateCopy(id);
      generated++;
    } catch (e) {
      console.error(`Failed to generate preview for ${id}:`, e);
    }
  }
  return generated;
};

interface FilterRule {
  field: string;
  operator: 'EXISTS' | 'NOT_EXISTS' | 'EQUALS' | 'NOT_EQUALS';
  value?: string;
}

export const generateCopyBulkWithRules = async (
  mode: 'all' | 'filtered',
  rules: FilterRule[]
): Promise<{ count: number }> => {
  // First, fetch all businesses (we'll paginate through them all)
  const allBusinesses: Business[] = [];
  let page = 1;
  const limit = 100;
  
  while (true) {
    const result = await getBusinesses({ page, limit });
    allBusinesses.push(...result.data);
    if (page >= result.totalPages) break;
    page++;
  }

  // Filter businesses based on mode and rules
  let filtered = allBusinesses;
  
  if (mode === 'filtered' && rules.length > 0) {
    filtered = allBusinesses.filter(business => {
      return rules.every(rule => {
        const value = (business as Record<string, unknown>)[rule.field];
        
        switch (rule.operator) {
          case 'EXISTS':
            return value !== undefined && value !== null && value !== '';
          case 'NOT_EXISTS':
            return value === undefined || value === null || value === '';
          case 'EQUALS':
            return String(value).toLowerCase() === String(rule.value).toLowerCase();
          case 'NOT_EQUALS':
            return String(value).toLowerCase() !== String(rule.value).toLowerCase();
          default:
            return true;
        }
      });
    });
  }

  // Only generate for businesses without existing copy and without websites
  const toGenerate = filtered.filter(b => !b.generated_copy && !b.has_website);
  
  // Generate previews using full pipeline (this runs in background)
  const generatePromise = (async () => {
    for (const business of toGenerate) {
      try {
        await generateFullPipeline(business.place_id);
      } catch (e) {
        console.error(`Failed to generate pipeline for ${business.place_id}:`, e);
      }
    }
  })();

  // Don't await - let it run in background
  generatePromise.catch(console.error);

  return { count: toGenerate.length };
};

// ============================================
// CAMPAIGN API
// ============================================

interface BackendCampaign {
  campaign_id: string;
  name: string;
  description?: string;
  searches: { textQuery: string; includedType?: string }[];
  max_results_per_search: number;
  only_without_website: boolean;
  created_at: string;
  updated_at: string;
  last_run_at?: string;
}

function transformCampaign(c: BackendCampaign): Campaign {
  return {
    campaign_id: c.campaign_id,
    name: c.name,
    description: c.description,
    searches: c.searches,
    max_results_per_search: c.max_results_per_search,
    only_without_website: c.only_without_website,
    created_at: c.created_at,
    updated_at: c.updated_at,
    last_run_at: c.last_run_at,
  };
}

export const getCampaigns = async (): Promise<Campaign[]> => {
  const response = await apiClient<{ campaigns: BackendCampaign[]; count: number }>(
    '/campaigns',
    { requiresAuth: true }
  );
  
  return response.campaigns.map(transformCampaign);
};

export const getCampaign = async (campaignId: string): Promise<Campaign | null> => {
  try {
    const response = await apiClient<{ campaign: BackendCampaign }>(
      `/campaigns/${encodeURIComponent(campaignId)}`,
      { requiresAuth: true }
    );
    return transformCampaign(response.campaign);
  } catch {
    return null;
  }
};

export const createCampaign = async (input: CampaignInput): Promise<Campaign> => {
  const response = await apiClient<{ campaign: BackendCampaign }>(
    '/campaigns',
    {
      method: 'POST',
      body: JSON.stringify(input),
      requiresAuth: true,
    }
  );
  
  return transformCampaign(response.campaign);
};

export const updateCampaign = async (campaignId: string, input: Partial<CampaignInput>): Promise<Campaign> => {
  const response = await apiClient<{ campaign: BackendCampaign }>(
    `/campaigns/${encodeURIComponent(campaignId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
      requiresAuth: true,
    }
  );
  
  return transformCampaign(response.campaign);
};

export const deleteCampaign = async (campaignId: string): Promise<boolean> => {
  try {
    await apiClient(
      `/campaigns/${encodeURIComponent(campaignId)}`,
      {
        method: 'DELETE',
        requiresAuth: true,
      }
    );
    return true;
  } catch {
    return false;
  }
};

export interface RunCampaignOptions {
  campaignId: string;
  skipCachedSearches?: boolean; // Default true - skip searches run in last 30 days
}

export const runCampaign = async (options: RunCampaignOptions): Promise<Job> => {
  // Starting a job from a campaign
  return startJob({
    campaignId: options.campaignId,
    skipCachedSearches: options.skipCachedSearches ?? true,
  });
};
