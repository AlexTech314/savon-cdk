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
  job_type: 'places' | 'copy' | 'both';
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  input: {
    business_types?: string[];
    states?: string[];
    limit?: number;
  };
  error?: string;
  records_processed?: number;
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
  job_type?: Job['job_type'];
}

export interface SearchQuery {
  textQuery: string;
  includedType?: string;
}

export interface StartJobInput {
  job_type: Job['job_type'];
  // New search-based format
  searches?: SearchQuery[];
  maxResultsPerSearch?: number;
  onlyWithoutWebsite?: boolean;
  // Legacy format (deprecated)
  business_types?: string[];
  states?: string[];
  limit?: number;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors?: string[];
}
