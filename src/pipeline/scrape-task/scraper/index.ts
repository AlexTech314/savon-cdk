import type { Browser } from 'puppeteer';
import type { ScrapedPage, ScrapeWebsiteResult } from '../types.js';
import { scrapePage, PagePool, ScrapeError } from './page.js';
import { isSameDomain, normalizeUrl, shouldSkipUrl, sortByPriority } from './url.js';

// Re-export submodules
export { extractTextContent, extractTitle, extractLinks, needsPuppeteer } from './html.js';
export { isSameDomain, normalizeUrl, shouldSkipUrl, sortByPriority, SKIP_PATTERNS, PRIORITY_PATHS } from './url.js';
export { fetchWithCloudscraper, scrapePage, PagePool, classifyError, isRetriableError } from './page.js';
export type { ScrapeError } from './page.js';

// ============ Domain Tracking ============

export interface DomainStats {
  domain: string;
  attempted: number;
  succeeded: number;
  failed: number;
  errors: Record<string, number>;  // error type -> count
}

/**
 * Track success/failure rates per domain
 */
export class DomainTracker {
  private stats = new Map<string, DomainStats>();
  
  private getDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }
  
  recordSuccess(url: string) {
    const domain = this.getDomain(url);
    const stat = this.stats.get(domain) || { domain, attempted: 0, succeeded: 0, failed: 0, errors: {} };
    stat.attempted++;
    stat.succeeded++;
    this.stats.set(domain, stat);
  }
  
  recordFailure(url: string, error: ScrapeError) {
    const domain = this.getDomain(url);
    const stat = this.stats.get(domain) || { domain, attempted: 0, succeeded: 0, failed: 0, errors: {} };
    stat.attempted++;
    stat.failed++;
    stat.errors[error.type] = (stat.errors[error.type] || 0) + 1;
    this.stats.set(domain, stat);
  }
  
  getStats(): DomainStats[] {
    return [...this.stats.values()];
  }
  
  getSuccessRate(url: string): number {
    const domain = this.getDomain(url);
    const stat = this.stats.get(domain);
    if (!stat || stat.attempted === 0) return 1; // Unknown domain, assume success
    return stat.succeeded / stat.attempted;
  }
  
  /**
   * Check if we should skip this domain due to repeated failures
   */
  shouldSkipDomain(url: string, minAttempts: number = 3, minSuccessRate: number = 0.2): boolean {
    const domain = this.getDomain(url);
    const stat = this.stats.get(domain);
    if (!stat || stat.attempted < minAttempts) return false;
    return (stat.succeeded / stat.attempted) < minSuccessRate;
  }
}

// ============ Failure Tracking ============

export interface FailureBreakdown {
  total: number;
  byType: Record<string, number>;
  byCode: Record<string, number>;
}

export class FailureTracker {
  private failures: ScrapeError[] = [];
  
  record(error: ScrapeError) {
    this.failures.push(error);
  }
  
  getBreakdown(): FailureBreakdown {
    const byType: Record<string, number> = {};
    const byCode: Record<string, number> = {};
    
    for (const error of this.failures) {
      byType[error.type] = (byType[error.type] || 0) + 1;
      if (error.code) {
        byCode[error.code] = (byCode[error.code] || 0) + 1;
      }
      if (error.statusCode) {
        byCode[`HTTP_${error.statusCode}`] = (byCode[`HTTP_${error.statusCode}`] || 0) + 1;
      }
    }
    
    return { total: this.failures.length, byType, byCode };
  }
  
  logSummary() {
    const breakdown = this.getBreakdown();
    if (breakdown.total === 0) return;
    
    console.log(`\n  [Failure Breakdown] ${breakdown.total} total failures:`);
    for (const [type, count] of Object.entries(breakdown.byType).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type}: ${count}`);
    }
    if (Object.keys(breakdown.byCode).length > 0) {
      console.log(`  By code:`);
      for (const [code, count] of Object.entries(breakdown.byCode).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
        console.log(`    ${code}: ${count}`);
      }
    }
  }
}

// ============ Early Exit Detection ============

export interface EarlyExitCriteria {
  minPages?: number;
  requireEmail?: boolean;
  requireTeamMember?: boolean;
}

/**
 * Check if we've gathered enough key data to stop crawling early
 */
export function checkEarlyExit(
  pages: ScrapedPage[],
  criteria: EarlyExitCriteria = {}
): boolean {
  const { minPages = 3, requireEmail = true, requireTeamMember = false } = criteria;
  
  if (pages.length < minPages) return false;
  
  // Quick check for email in text content
  const hasEmail = pages.some(p => p.text_content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/));
  
  // Check for team-related page
  const hasTeamPage = pages.some(p => {
    const urlLower = p.url.toLowerCase();
    return /\b(about|team|staff|people|leadership)\b/.test(urlLower);
  });
  
  if (requireEmail && !hasEmail) return false;
  if (requireTeamMember && !hasTeamPage) return false;
  
  return true;
}

// ============ Extended Result Type ============

export interface ScrapeWebsiteExtendedResult extends ScrapeWebsiteResult {
  failureBreakdown: FailureBreakdown;
  earlyExit: boolean;
}

// ============ Main Scrape Function ============

export interface ScrapeWebsiteOptions {
  maxPages?: number;
  browser?: Browser | null;
  pagePool?: PagePool | null;
  domainTracker?: DomainTracker | null;
  failureTracker?: FailureTracker | null;
  enableEarlyExit?: boolean;
  earlyExitCriteria?: EarlyExitCriteria;
}

/**
 * Scrape a website, crawling up to maxPages pages
 */
export async function scrapeWebsite(
  websiteUri: string,
  maxPages: number,
  browser: Browser | null
): Promise<ScrapeWebsiteResult>;

export async function scrapeWebsite(
  websiteUri: string,
  options: ScrapeWebsiteOptions
): Promise<ScrapeWebsiteExtendedResult>;

export async function scrapeWebsite(
  websiteUri: string,
  maxPagesOrOptions: number | ScrapeWebsiteOptions,
  browserArg?: Browser | null
): Promise<ScrapeWebsiteResult | ScrapeWebsiteExtendedResult> {
  // Handle legacy signature
  const options: ScrapeWebsiteOptions = typeof maxPagesOrOptions === 'number'
    ? { maxPages: maxPagesOrOptions, browser: browserArg }
    : maxPagesOrOptions;
  
  const {
    maxPages = 10,
    browser = null,
    pagePool = null,
    domainTracker = null,
    failureTracker = null,
    enableEarlyExit = false,
    earlyExitCriteria = {},
  } = options;
  
  const visited = new Set<string>();
  const queued = new Set<string>(); // Track URLs already in queue (deduplication)
  const toVisit: string[] = [websiteUri];
  queued.add(normalizeUrl(websiteUri) || websiteUri);
  
  const pages: ScrapedPage[] = [];
  let cloudscraperCount = 0;
  let puppeteerCount = 0;
  let consecutiveFailures = 0;
  let earlyExitTriggered = false;
  
  const localFailureTracker = failureTracker || new FailureTracker();
  
  while (toVisit.length > 0 && pages.length < maxPages) {
    const url = toVisit.shift()!;
    
    // Normalize URL
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      continue;
    }
    
    if (visited.has(normalizedUrl)) {
      continue;
    }
    
    // Only scrape same-domain URLs
    if (!isSameDomain(normalizedUrl, websiteUri)) {
      continue;
    }
    
    // Skip non-content URLs
    if (shouldSkipUrl(normalizedUrl)) {
      continue;
    }
    
    visited.add(normalizedUrl);
    
    // Scrape the page
    const { result, error } = await scrapePage(normalizedUrl, { browser, pagePool });
    
    if (result) {
      pages.push(result.page);
      consecutiveFailures = 0;
      
      // Track domain success
      if (domainTracker) {
        domainTracker.recordSuccess(normalizedUrl);
      }
      
      // Track which method was used
      if (result.method === 'puppeteer') {
        puppeteerCount++;
      } else {
        cloudscraperCount++;
      }
      
      // Add links to queue if page has enough content
      if (result.page.text_content.length > 500) {
        const sameDomainLinks = result.page.links
          .filter(link => isSameDomain(link, websiteUri))
          .filter(link => !shouldSkipUrl(link))
          .map(link => normalizeUrl(link))
          .filter((link): link is string => link !== null)
          .filter(link => !visited.has(link))
          .filter(link => !queued.has(link)); // Deduplication: skip already-queued URLs
        
        // Sort by priority (about, contact, team first)
        const prioritized = sortByPriority(sameDomainLinks);
        
        // Add to queue and track
        for (const link of prioritized) {
          if (!queued.has(link)) {
            queued.add(link);
            toVisit.push(link);
          }
        }
      }
      
      // Check for early exit
      if (enableEarlyExit && checkEarlyExit(pages, earlyExitCriteria)) {
        console.log(`  [Early exit] Found key data after ${pages.length} pages`);
        earlyExitTriggered = true;
        break;
      }
    } else {
      consecutiveFailures++;
      
      // Track failure
      if (error) {
        localFailureTracker.record(error);
        if (domainTracker) {
          domainTracker.recordFailure(normalizedUrl, error);
        }
      }
    }
    
    // Dynamic delay based on success
    // Slow down if hitting failures, speed up if succeeding
    const baseDelay = consecutiveFailures > 0 ? 200 : 50;
    const delay = Math.min(baseDelay * (consecutiveFailures + 1), 2000);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // If we've failed too many times in a row, bail out
    if (consecutiveFailures >= 5) {
      console.log(`  [Giving up] ${consecutiveFailures} consecutive failures`);
      break;
    }
  }
  
  // Determine primary method used (whichever was used more)
  const primaryMethod = puppeteerCount > cloudscraperCount ? 'puppeteer' : 'cloudscraper';
  
  const baseResult: ScrapeWebsiteResult = {
    pages,
    method: primaryMethod,
    cloudscraperCount,
    puppeteerCount,
  };
  
  // Return extended result if using new options interface
  if (typeof maxPagesOrOptions !== 'number') {
    return {
      ...baseResult,
      failureBreakdown: localFailureTracker.getBreakdown(),
      earlyExit: earlyExitTriggered,
    };
  }
  
  return baseResult;
}
