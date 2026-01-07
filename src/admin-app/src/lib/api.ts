/**
 * API Layer for Savon Control Center
 * 
 * This file contains mock implementations of all API calls.
 * Replace these with real API calls when integrating with the backend.
 * 
 * API Base URL: https://api-alpha.savondesigns.com
 */

import { 
  Business, 
  Job, 
  PaginatedResponse, 
  BusinessFilters, 
  StartJobInput,
  ImportResult 
} from './types';
import { mockBusinesses, mockJobs } from './mockData';

// Simulated network delay
const delay = (ms: number = 300 + Math.random() * 500) => 
  new Promise(resolve => setTimeout(resolve, ms));

// ============================================
// BUSINESS API
// Replace with: GET /api/businesses
// ============================================
export const getBusinesses = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  filters?: BusinessFilters;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<PaginatedResponse<Business>> => {
  await delay();
  
  const { page = 1, limit = 20, search, filters, sortBy, sortOrder = 'asc' } = params;
  
  let filtered = [...mockBusinesses];
  
  // Apply search
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(b => 
      b.name.toLowerCase().includes(searchLower) ||
      b.city.toLowerCase().includes(searchLower) ||
      b.address.toLowerCase().includes(searchLower)
    );
  }
  
  // Apply filters
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
  if (sortBy) {
    filtered.sort((a, b) => {
      const aVal = (a as any)[sortBy] || '';
      const bVal = (b as any)[sortBy] || '';
      const comparison = String(aVal).localeCompare(String(bVal));
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }
  
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const data = filtered.slice(startIndex, startIndex + limit);
  
  return { data, total, page, limit, totalPages };
};

// ============================================
// Replace with: GET /api/businesses/:place_id
// ============================================
export const getBusiness = async (place_id: string): Promise<Business | null> => {
  await delay();
  return mockBusinesses.find(b => b.place_id === place_id) || null;
};

// ============================================
// Replace with: PUT /api/businesses/:place_id
// ============================================
export const updateBusiness = async (
  place_id: string, 
  data: Partial<Business>
): Promise<Business> => {
  await delay();
  
  const index = mockBusinesses.findIndex(b => b.place_id === place_id);
  if (index === -1) throw new Error('Business not found');
  
  mockBusinesses[index] = { 
    ...mockBusinesses[index], 
    ...data, 
    updated_at: new Date().toISOString() 
  };
  
  return mockBusinesses[index];
};

// ============================================
// Replace with: DELETE /api/businesses/:place_id
// ============================================
export const deleteBusiness = async (place_id: string): Promise<boolean> => {
  await delay();
  
  const index = mockBusinesses.findIndex(b => b.place_id === place_id);
  if (index === -1) return false;
  
  mockBusinesses.splice(index, 1);
  return true;
};

// ============================================
// Replace with: DELETE /api/businesses (bulk)
// ============================================
export const deleteBusinesses = async (place_ids: string[]): Promise<number> => {
  await delay(500 + Math.random() * 500);
  
  let deleted = 0;
  for (const id of place_ids) {
    const index = mockBusinesses.findIndex(b => b.place_id === id);
    if (index !== -1) {
      mockBusinesses.splice(index, 1);
      deleted++;
    }
  }
  
  return deleted;
};

// ============================================
// Replace with: POST /api/businesses/import
// ============================================
export const importBusinesses = async (csvData: string): Promise<ImportResult> => {
  await delay(1000 + Math.random() * 1000);
  
  // Mock parsing - in reality, parse CSV and validate
  const lines = csvData.split('\n').filter(l => l.trim());
  const imported = Math.max(0, lines.length - 1); // Subtract header
  
  return {
    success: true,
    imported,
    failed: 0,
  };
};

// ============================================
// Replace with: GET /api/businesses/export
// ============================================
export const exportBusinesses = async (filters?: BusinessFilters): Promise<string> => {
  await delay();
  
  let businesses = [...mockBusinesses];
  
  if (filters?.business_type) {
    businesses = businesses.filter(b => b.business_type === filters.business_type);
  }
  if (filters?.state) {
    businesses = businesses.filter(b => b.state === filters.state);
  }
  
  // Generate CSV
  const headers = ['place_id', 'name', 'business_type', 'address', 'city', 'state', 'phone', 'website', 'rating', 'review_count'];
  const rows = businesses.map(b => 
    headers.map(h => JSON.stringify((b as any)[h] || '')).join(',')
  );
  
  return [headers.join(','), ...rows].join('\n');
};

// ============================================
// JOB API
// Replace with: GET /api/jobs
// ============================================
export const getJobs = async (params: {
  page?: number;
  limit?: number;
  status?: Job['status'];
  job_type?: Job['job_type'];
}): Promise<PaginatedResponse<Job>> => {
  await delay();
  
  const { page = 1, limit = 20, status, job_type } = params;
  
  let filtered = [...mockJobs];
  
  if (status) {
    filtered = filtered.filter(j => j.status === status);
  }
  if (job_type) {
    filtered = filtered.filter(j => j.job_type === job_type);
  }
  
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const data = filtered.slice(startIndex, startIndex + limit);
  
  return { data, total, page, limit, totalPages };
};

// ============================================
// Replace with: GET /api/jobs/:job_id
// ============================================
export const getJob = async (job_id: string): Promise<Job | null> => {
  await delay();
  return mockJobs.find(j => j.job_id === job_id) || null;
};

// ============================================
// Replace with: POST /api/jobs
// ============================================
export const startJob = async (input: StartJobInput): Promise<Job> => {
  await delay(800);
  
  const newJob: Job = {
    job_id: `job_${Math.random().toString(36).substring(2, 10)}`,
    job_type: input.job_type,
    status: 'PENDING',
    created_at: new Date().toISOString(),
    input: {
      business_types: input.business_types,
      states: input.states,
      limit: input.limit,
    },
  };
  
  mockJobs.unshift(newJob);
  
  // Simulate job starting after a short delay
  setTimeout(() => {
    const job = mockJobs.find(j => j.job_id === newJob.job_id);
    if (job) {
      job.status = 'RUNNING';
      job.started_at = new Date().toISOString();
    }
  }, 2000);
  
  // Simulate job completing
  setTimeout(() => {
    const job = mockJobs.find(j => j.job_id === newJob.job_id);
    if (job && job.status === 'RUNNING') {
      job.status = Math.random() > 0.1 ? 'SUCCEEDED' : 'FAILED';
      job.completed_at = new Date().toISOString();
      job.records_processed = job.status === 'SUCCEEDED' ? Math.floor(Math.random() * 100) + 20 : undefined;
      job.error = job.status === 'FAILED' ? 'Simulated random failure' : undefined;
    }
  }, 10000);
  
  return newJob;
};

// ============================================
// STATS API
// Replace with: GET /api/stats
// ============================================
export const getStats = async (): Promise<{
  totalBusinesses: number;
  businessesMissingCopy: number;
  activeJobs: number;
  lastJobRun: string | null;
}> => {
  await delay();
  
  const runningJobs = mockJobs.filter(j => j.status === 'RUNNING');
  const lastCompletedJob = mockJobs.find(j => j.completed_at);
  
  return {
    totalBusinesses: mockBusinesses.length,
    businessesMissingCopy: mockBusinesses.filter(b => !b.generated_copy).length,
    activeJobs: runningJobs.length,
    lastJobRun: lastCompletedJob?.completed_at || null,
  };
};

// ============================================
// GENERATE COPY API
// Replace with: POST /api/businesses/:place_id/generate-copy
// ============================================
export const generateCopy = async (place_id: string): Promise<Business> => {
  await delay(1500);
  
  const business = mockBusinesses.find(b => b.place_id === place_id);
  if (!business) throw new Error('Business not found');
  
  business.generated_copy = {
    headline: `${business.city}'s Premier ${business.business_type}`,
    tagline: `Quality service you can trust since ${2000 + Math.floor(Math.random() * 20)}`,
    services: ['Emergency Services', '24/7 Availability', 'Free Estimates', 'Licensed & Insured'],
    about: `${business.name} is your trusted local ${business.business_type.toLowerCase()} in ${business.city}, ${business.state}. We pride ourselves on delivering exceptional service with guaranteed satisfaction.`,
  };
  business.updated_at = new Date().toISOString();
  
  return business;
};

// ============================================
// BULK GENERATE COPY API
// Replace with: POST /api/businesses/generate-copy
// ============================================
export const generateCopyBulk = async (place_ids: string[]): Promise<number> => {
  await delay(2000);
  
  let generated = 0;
  for (const id of place_ids) {
    const business = mockBusinesses.find(b => b.place_id === id);
    if (business && !business.generated_copy) {
      business.generated_copy = {
        headline: `${business.city}'s Premier ${business.business_type}`,
        tagline: `Quality service you can trust`,
        services: ['Emergency Services', '24/7 Availability', 'Free Estimates'],
        about: `${business.name} serves ${business.city}, ${business.state}.`,
      };
      business.updated_at = new Date().toISOString();
      generated++;
    }
  }
  
  return generated;
};
