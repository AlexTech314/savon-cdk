import type { Browser, Page } from 'puppeteer';
import { cloudscraper } from '../config.js';
import type { ScrapedPage, CloudscraperResponse, ScrapePageResult } from '../types.js';
import { extractTextContent, extractTitle, extractLinks, needsPuppeteer } from './html.js';

// ============ Error Classification ============

export interface ScrapeError {
  type: 'timeout' | 'dns' | 'connection' | 'cloudflare' | 'http' | 'unknown';
  code?: string;
  statusCode?: number;
  message: string;
}

/**
 * Classify an error for tracking and decision-making
 */
export function classifyError(error: any): ScrapeError {
  const message = error?.message || String(error);
  const code = error?.code;
  
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return { type: 'dns', code, message: 'Domain not found' };
  }
  if (code === 'ECONNREFUSED') {
    return { type: 'connection', code, message: 'Connection refused' };
  }
  if (code === 'ECONNRESET' || code === 'EPIPE') {
    return { type: 'connection', code, message: 'Connection reset' };
  }
  if (code === 'ETIMEDOUT' || message.includes('timeout')) {
    return { type: 'timeout', code, message: 'Request timeout' };
  }
  if (message.includes('403') || message.includes('Cloudflare')) {
    return { type: 'cloudflare', message: 'Cloudflare protection' };
  }
  
  return { type: 'unknown', code, message: message.slice(0, 100) };
}

/**
 * Check if error is retriable (worth trying again with same method)
 */
export function isRetriableError(error: ScrapeError): boolean {
  return error.type === 'timeout' || error.type === 'connection';
}

/**
 * Check if error means we should skip Puppeteer fallback
 */
export function shouldSkipPuppeteer(error: ScrapeError): boolean {
  // Don't waste time with Puppeteer if domain doesn't exist
  return error.type === 'dns';
}

// ============ Cloudflare Detection ============

const CLOUDFLARE_PATTERNS = [
  'Just a moment',
  'cf-browser-verification',
  'cf_chl_opt',
  'challenge-platform',
  '__cf_chl_f_tk',
  'Enable JavaScript and cookies',
  'Checking your browser',
  'cf-spinner',
];

/**
 * Check if HTML response is a Cloudflare challenge page
 */
export function isCloudflareChallenge(html: string): boolean {
  return CLOUDFLARE_PATTERNS.some(pattern => html.includes(pattern));
}

/**
 * Check if response indicates Cloudflare protection in status or body
 */
export function needsCloudflareBypass(statusCode: number, html: string): boolean {
  if (statusCode === 403 || statusCode === 503) {
    return true;
  }
  return isCloudflareChallenge(html);
}

// ============ Fetching ============

/**
 * Fetch a URL using cloudscraper to bypass Cloudflare protection
 */
export async function fetchWithCloudscraper(url: string, timeoutMs: number = 10000): Promise<CloudscraperResponse> {
  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
  });

  // Create the cloudscraper request promise
  const requestPromise = cloudscraper({
    method: 'GET',
    uri: url,
    resolveWithFullResponse: true,
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  }).then((response: { statusCode: number; body: string }) => ({
    body: response.body,
    statusCode: response.statusCode || 200,
  }));

  // Race between timeout and request
  return Promise.race([requestPromise, timeoutPromise]);
}

/**
 * Fetch with retry and exponential backoff
 */
export async function fetchWithRetry(
  url: string, 
  maxRetries: number = 2
): Promise<{ response: CloudscraperResponse; attempts: number } | { error: ScrapeError; attempts: number }> {
  let lastError: ScrapeError | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Exponential backoff: 10s, 15s, 20s
      const timeoutMs = 10000 + (attempt * 5000);
      const response = await fetchWithCloudscraper(url, timeoutMs);
      return { response, attempts: attempt + 1 };
    } catch (err) {
      lastError = classifyError(err);
      
      // Don't retry DNS errors - domain won't magically appear
      if (!isRetriableError(lastError)) {
        break;
      }
      
      if (attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 4000);
        console.log(`  [Retry ${attempt + 1}/${maxRetries}] ${url} after ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
  
  return { error: lastError!, attempts: maxRetries + 1 };
}

// ============ Page Pool ============

/**
 * Simple page pool for Puppeteer page reuse
 */
export class PagePool {
  private available: Page[] = [];
  private browser: Browser;
  private maxPages: number;
  private created: number = 0;
  
  constructor(browser: Browser, maxPages: number = 5) {
    this.browser = browser;
    this.maxPages = maxPages;
  }
  
  async acquire(): Promise<Page> {
    if (this.available.length > 0) {
      return this.available.pop()!;
    }
    
    if (this.created < this.maxPages) {
      this.created++;
      const page = await this.browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      return page;
    }
    
    // Wait for a page to become available
    while (this.available.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.available.pop()!;
  }
  
  release(page: Page) {
    this.available.push(page);
  }
  
  async closeAll() {
    for (const page of this.available) {
      await page.close().catch(() => {});
    }
    this.available = [];
    this.created = 0;
  }
}

// ============ Scraping ============

export interface ScrapePageOptions {
  browser?: Browser | null;
  pagePool?: PagePool | null;
}

/**
 * Scrape a single page using cloudscraper with Puppeteer fallback
 * Returns result plus error info for tracking
 */
export async function scrapePage(
  url: string, 
  options: ScrapePageOptions = {}
): Promise<{ result: ScrapePageResult | null; error?: ScrapeError }> {
  const { browser, pagePool } = options;
  
  try {
    let html: string;
    let statusCode: number;
    let usedPuppeteer = false;
    let scrapeError: ScrapeError | undefined;
    
    // First, try cloudscraper with retry
    const fetchResult = await fetchWithRetry(url);
    
    if ('error' in fetchResult) {
      scrapeError = fetchResult.error;
      const errorLabel = `${scrapeError.type}${scrapeError.code ? `:${scrapeError.code}` : ''}`;
      
      // Check if we should skip Puppeteer entirely
      if (shouldSkipPuppeteer(scrapeError)) {
        console.log(`  [${errorLabel}] ${url} - skipping (unrecoverable)`);
        return { result: null, error: scrapeError };
      }
      
      // Try Puppeteer fallback
      if (browser || pagePool) {
        console.log(`  [${errorLabel}] ${url} - trying Puppeteer`);
        
        let page: Page | null = null;
        try {
          page = pagePool ? await pagePool.acquire() : await browser!.newPage();
          
          if (!pagePool) {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1920, height: 1080 });
          }
          
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          
          // Wait for Cloudflare challenge to resolve
          let attempts = 0;
          const maxAttempts = 10;
          while (attempts < maxAttempts) {
            const pageContent = await page.content();
            if (!isCloudflareChallenge(pageContent)) {
              break;
            }
            console.log(`  [Cloudflare] Waiting for challenge... (${attempts + 1}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            attempts++;
          }
          
          html = await page.content();
          statusCode = 200;
          usedPuppeteer = true;
          
          if (pagePool) {
            pagePool.release(page);
          } else {
            await page.close();
          }
          page = null;
          
          // Check if still on Cloudflare challenge
          if (isCloudflareChallenge(html)) {
            console.log(`  [Cloudflare] Challenge not resolved for ${url}`);
            return { result: null, error: { type: 'cloudflare', message: 'Challenge not resolved' } };
          }
        } catch (puppeteerError) {
          console.log(`  [Puppeteer error] ${url}: ${puppeteerError}`);
          if (page) {
            if (pagePool) {
              pagePool.release(page);
            } else {
              await page.close().catch(() => {});
            }
          }
          return { result: null, error: scrapeError };
        }
      } else {
        console.log(`  [${errorLabel}] ${url}`);
        return { result: null, error: scrapeError };
      }
    } else {
      html = fetchResult.response.body;
      statusCode = fetchResult.response.statusCode;
      
      if (statusCode >= 400) {
        console.log(`  [${statusCode}] ${url}`);
        return { result: null, error: { type: 'http', statusCode, message: `HTTP ${statusCode}` } };
      }
      
      // Check if we got a Cloudflare challenge page despite 200 status
      if (needsCloudflareBypass(statusCode, html) && (browser || pagePool)) {
        console.log(`  [Cloudflare in body] ${url} - using Puppeteer`);
        
        let page: Page | null = null;
        try {
          page = pagePool ? await pagePool.acquire() : await browser!.newPage();
          
          if (!pagePool) {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1920, height: 1080 });
          }
          
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          
          let attempts = 0;
          while (attempts < 10) {
            const pageContent = await page.content();
            if (!isCloudflareChallenge(pageContent)) break;
            await new Promise(resolve => setTimeout(resolve, 3000));
            attempts++;
          }
          
          html = await page.content();
          usedPuppeteer = true;
          
          if (pagePool) {
            pagePool.release(page);
          } else {
            await page.close();
          }
          page = null;
        } catch (err) {
          if (page) {
            if (pagePool) {
              pagePool.release(page);
            } else {
              await page.close().catch(() => {});
            }
          }
          // Fall through with original HTML
        }
      }
    }
    
    // Check if we need Puppeteer for JavaScript rendering
    if (!usedPuppeteer && (browser || pagePool) && needsPuppeteer(html)) {
      console.log(`  [JS] ${url} - needs Puppeteer for rendering`);
      
      let page: Page | null = null;
      try {
        page = pagePool ? await pagePool.acquire() : await browser!.newPage();
        
        if (!pagePool) {
          await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        }
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        html = await page.content();
        usedPuppeteer = true;
        
        if (pagePool) {
          pagePool.release(page);
        } else {
          await page.close();
        }
      } catch (error) {
        console.log(`  [Puppeteer error] ${url}: ${error}`);
        if (page) {
          if (pagePool) {
            pagePool.release(page);
          } else {
            await page.close().catch(() => {});
          }
        }
        // Fall back to cloudscraper HTML
      }
    }
    
    const textContent = extractTextContent(html);
    const title = extractTitle(html);
    const links = extractLinks(html, url);
    
    const method = usedPuppeteer ? 'puppeteer' : 'cloudscraper';
    console.log(`  [${method}] ${url} - ${textContent.length} chars, ${links.length} links`);
    
    return {
      result: {
        page: {
          url,
          title,
          html,
          text_content: textContent,
          links,
          status_code: statusCode,
          scraped_at: new Date().toISOString(),
        },
        method,
      },
    };
  } catch (error) {
    const scrapeError = classifyError(error);
    console.log(`  [Error:${scrapeError.type}] ${url}: ${scrapeError.message}`);
    return { result: null, error: scrapeError };
  }
}
