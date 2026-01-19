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
  
  // Pipeline status flags
  searched?: boolean;
  details_fetched?: boolean;
  reviews_fetched?: boolean;
  photos_fetched?: boolean;
  copy_generated?: boolean;
  has_website?: boolean;
  
  // Data tier used during search
  data_tier?: 'pro' | 'enterprise' | 'enterprise_atmosphere';
  
  // Web scrape data
  web_scraped?: boolean;
  web_scraped_at?: string;
  web_raw_s3_key?: string;
  web_extracted_s3_key?: string;
  web_pages_count?: number;
  web_scrape_method?: 'fetch' | 'cloudscraper' | 'puppeteer';
  web_total_bytes?: number;
  web_scrape_duration_ms?: number;
}

export interface JobMetrics {
  search?: {
    queries_run: number;
    businesses_found: number;
    cached_skipped?: number;
  };
  details?: {
    processed: number;
    failed: number;
    filtered: number;
  };
  scrape?: {
    processed: number;
    failed: number;
    filtered: number;
    cloudscraper_count: number;
    puppeteer_count: number;
    total_pages: number;
    total_bytes: number;
  };
  enrich?: {
    processed: number;
    failed: number;
    filtered: number;
    with_reviews: number;
    without_reviews: number;
  };
  photos?: {
    processed: number;
    failed: number;
    filtered: number;
    photos_downloaded: number;
  };
  copy?: {
    processed: number;
    failed: number;
    filtered: number;
    skipped_no_reviews: number;
  };
}

export interface Job {
  job_id: string;
  job_type: 'places' | 'pipeline';
  job_name?: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
  campaign_id?: string;
  campaign_name?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  input?: {
    campaignId?: string;
    jobType: 'places' | 'pipeline';
    searches?: { textQuery: string; includedType?: string }[];
    maxResultsPerSearch?: number;
    onlyWithoutWebsite?: boolean;
    runDetails?: boolean;
    runEnrich?: boolean;
    runPhotos?: boolean;
    runCopy?: boolean;
    runScrape?: boolean;
    filterRules?: Array<{ field: string; operator: string; value?: string }>;
    placeIds?: string[];
  };
  error?: string;
  metrics?: JobMetrics;
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
  countIsApproximate?: boolean;
}

export type PipelineStatus = 'searched' | 'details' | 'reviews' | 'photos' | 'copy' | 'complete' | 'has_website';

export interface BusinessFilters {
  search?: string;
  business_type?: string;
  state?: string;
  has_copy?: boolean | null;
  pipeline_status?: PipelineStatus;
  has_website?: boolean | null;
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
