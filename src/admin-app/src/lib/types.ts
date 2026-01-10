export interface Business {
  place_id: string;
  name: string;
  business_type: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  website?: string;
  rating?: number;
  review_count?: number;
  friendly_slug: string;
  generated_copy?: {
    headline: string;
    tagline: string;
    services: string[];
    about: string;
  };
  created_at: string;
  updated_at: string;
}

export interface Job {
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
}

export interface User {
  email: string;
  name: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BusinessFilters {
  search?: string;
  business_type?: string;
  state?: string;
  has_copy?: boolean | null;
}

export interface JobFilters {
  status?: Job['status'];
}

export interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors?: string[];
}
