import { Browser } from 'puppeteer';

// ============ Filter and Job Types ============

export interface FilterRule {
  field: string;
  operator: 'EXISTS' | 'NOT_EXISTS' | 'EQUALS' | 'NOT_EQUALS';
  value?: string;
}

export interface JobInput {
  jobId?: string;
  runScrape?: boolean;
  maxPagesPerSite?: number;
  concurrency?: number;
  filterRules?: FilterRule[];
  skipIfDone?: boolean;
  forceRescrape?: boolean;
  placeIds?: string[];
  // Speed optimization options
  fastMode?: boolean; // Skip Puppeteer fallback entirely for max speed
  // Distributed Map batch reference (items stored in S3 to avoid container override size limits)
  batchS3Key?: string; // S3 key to read placeIds from
  batchIndex?: number; // Batch number for logging
}

// ============ Business Types ============

export interface Business {
  place_id: string;
  business_name: string;
  website_uri?: string;
  web_scraped?: boolean;
  phone?: string;
  international_phone?: string;
  [key: string]: unknown;
}

// ============ Scraped Data Types ============

export interface ScrapedPage {
  url: string;
  title: string;
  html: string;
  text_content: string;
  links: string[];
  status_code: number;
  scraped_at: string;
}

export interface TeamMember {
  name: string;
  title: string;
  source_url: string;
}

export interface NewHireMention {
  text: string;
  source_url: string;
}

export interface AcquisitionSignal {
  text: string;
  signal_type: 'acquired' | 'sold' | 'merger' | 'new_ownership' | 'rebranded';
  date_mentioned?: string;
  source_url: string;
}

export interface HistorySnippet {
  text: string;
  source_url: string;
}

// ============ Extracted Data Types ============

export interface ExtractedData {
  // Contact info
  emails: string[];
  phones: string[];
  contact_page_url: string | null;
  social: {
    linkedin?: string;
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
  
  // Team/employee data
  team_members: TeamMember[];
  headcount_estimate: number | null;
  headcount_source: string | null;
  new_hire_mentions: NewHireMention[];
  
  // Acquisition signals
  acquisition_signals: AcquisitionSignal[];
  has_acquisition_signal: boolean;
  acquisition_summary: string | null;
  
  // Business history
  founded_year: number | null;
  founded_source: string | null;
  years_in_business: number | null;
  history_snippets: HistorySnippet[];
}

// ============ S3 Storage Types ============

export interface RawScrapeData {
  place_id: string;
  website_uri: string;
  scraped_at: string;
  scrape_method: 'fetch' | 'cloudscraper' | 'puppeteer';
  duration_ms: number;
  pages: ScrapedPage[];
}

export interface ExtractedScrapeData {
  place_id: string;
  website_uri: string;
  extracted_at: string;
  contacts: {
    emails: string[];
    phones: string[];
    contact_page_url: string | null;
    social: ExtractedData['social'];
  };
  team: {
    members: TeamMember[];
    headcount_estimate: number | null;
    headcount_source: string | null;
    new_hire_mentions: NewHireMention[];
  };
  acquisition: {
    signals: AcquisitionSignal[];
    has_signal: boolean;
    summary: string | null;
  };
  history: {
    founded_year: number | null;
    founded_source: string | null;
    years_in_business: number | null;
    snippets: HistorySnippet[];
  };
}

// ============ Metrics Types ============

export interface ScrapeMetrics {
  processed: number;
  failed: number;
  filtered: number;
  cloudscraper_count: number;
  puppeteer_count: number;
  total_pages: number;
  total_bytes: number;
}

// ============ HTTP Response Types ============

export interface CloudscraperResponse {
  body: string;
  statusCode: number;
}

// ============ Scrape Result Types ============

export interface ScrapePageResult {
  page: ScrapedPage;
  method: 'cloudscraper' | 'puppeteer';
}

export interface ScrapeWebsiteResult {
  pages: ScrapedPage[];
  method: 'cloudscraper' | 'puppeteer';
  cloudscraperCount: number;
  puppeteerCount: number;
}
