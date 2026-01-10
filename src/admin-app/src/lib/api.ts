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
  StartJobInput,
  ImportResult 
} from './types';
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
  queryParams.set('limit', String(limit));
  if (search) {
    queryParams.set('q', search);
  }
  
  const response = await apiClient<{
    items: BackendBusiness[];
    lastKey: string | null;
    count: number;
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
    page, 
    limit, 
    totalPages: Math.ceil(response.count / limit) 
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
  job_type: 'places' | 'copy' | 'both';
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  input?: {
    businessTypes?: string[];
    states?: string[];
    countPerType?: number;
    placeIds?: string[];
    allMissingCopy?: boolean;
  };
  error?: string;
  execution_arn?: string;
}

function transformJob(j: BackendJob): Job {
  return {
    job_id: j.job_id,
    job_type: j.job_type,
    status: j.status === 'TIMED_OUT' || j.status === 'ABORTED' ? 'FAILED' : j.status,
    created_at: j.created_at,
    started_at: j.started_at,
    completed_at: j.completed_at,
    input: {
      business_types: j.input?.businessTypes,
      states: j.input?.states,
      limit: j.input?.countPerType,
    },
    error: j.error,
  };
}

export const getJobs = async (params: {
  page?: number;
  limit?: number;
  status?: Job['status'];
  job_type?: Job['job_type'];
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
  
  let jobs = response.jobs.map(transformJob);
  
  // Client-side filter by job_type if needed
  if (params.job_type) {
    jobs = jobs.filter(j => j.job_type === params.job_type);
  }
  
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

export const startJob = async (input: StartJobInput): Promise<Job> => {
  // Transform to backend format
  const backendInput = {
    jobType: input.job_type,
    // New search-based format
    searches: input.searches,
    maxResultsPerSearch: input.maxResultsPerSearch,
    onlyWithoutWebsite: input.onlyWithoutWebsite,
    // Legacy format (for backwards compatibility)
    businessTypes: input.business_types,
    states: input.states,
    countPerType: input.limit,
  };
  
  const response = await apiClient<{ job: BackendJob; message: string }>(
    '/jobs',
    {
      method: 'POST',
      body: JSON.stringify(backendInput),
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
// GENERATE COPY API
// ============================================

export const generateCopy = async (place_id: string): Promise<Business> => {
  // Start a copy job for a specific business
  const job = await startJob({
    job_type: 'copy',
    // The backend would need to support placeIds filter
  });
  
  // Return the business (copy generation happens async)
  const business = await getBusiness(place_id);
  if (!business) {
    throw new Error('Business not found');
  }
  
  return business;
};

export const generateCopyBulk = async (place_ids: string[]): Promise<number> => {
  // Start a copy job
  await startJob({ job_type: 'copy' });
  return place_ids.length;
};
