import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { EventEmitter } from 'events';
import { createRequire } from 'module';
import { FIRST_NAMES } from './first-names.js';

// Increase max listeners to avoid warnings with concurrent requests
EventEmitter.defaultMaxListeners = 50;

// cloudscraper uses CommonJS, need createRequire for ES modules
const require = createRequire(import.meta.url);
export const cloudscraper = require('cloudscraper');

// ============ AWS Clients ============

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
export const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const s3Client = new S3Client({ region: process.env.AWS_REGION });

// ============ Environment Variables ============

export const BUSINESSES_TABLE_NAME = process.env.BUSINESSES_TABLE_NAME!;
export const CAMPAIGN_DATA_BUCKET = process.env.CAMPAIGN_DATA_BUCKET!;
export const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME;

// Task resource info for dynamic concurrency calculation
export const TASK_MEMORY_MIB = parseInt(process.env.TASK_MEMORY_MIB || '4096', 10);
export const TASK_CPU_UNITS = parseInt(process.env.TASK_CPU_UNITS || '1024', 10);

// ============ Concurrency Calculation ============

/**
 * Calculate optimal concurrency based on task resources.
 * 
 * Memory considerations:
 * - Puppeteer/Chromium: ~300MB per browser page
 * - Cloudscraper (no Puppeteer): ~50MB per concurrent request
 * - Base overhead: ~500MB for Node.js + browser process
 * 
 * CPU considerations:
 * - Puppeteer is CPU-intensive during page load
 * - Cloudscraper is mostly I/O bound
 * 
 * @param fastMode If true, Puppeteer is disabled so we can be more aggressive
 */
export function calculateOptimalConcurrency(fastMode: boolean): number {
  const baseOverheadMB = 500;
  const availableMemoryMB = TASK_MEMORY_MIB - baseOverheadMB;
  
  if (fastMode) {
    // Cloudscraper-only mode: ~50MB per concurrent request, mostly I/O bound
    // Can be very aggressive with concurrency
    const memoryBasedConcurrency = Math.floor(availableMemoryMB / 50);
    // Limit by CPU: ~20 concurrent requests per vCPU for I/O bound work
    const cpuBasedConcurrency = Math.floor((TASK_CPU_UNITS / 1024) * 30);
    return Math.min(memoryBasedConcurrency, cpuBasedConcurrency, 50); // Cap at 50
  } else {
    // Puppeteer mode: ~300MB per page, CPU intensive
    const memoryBasedConcurrency = Math.floor(availableMemoryMB / 300);
    // Limit by CPU: ~3-5 browser pages per vCPU
    const cpuBasedConcurrency = Math.floor((TASK_CPU_UNITS / 1024) * 4);
    return Math.max(Math.min(memoryBasedConcurrency, cpuBasedConcurrency), 3); // Min 3
  }
}

// ============ Regex Patterns ============

export const PATTERNS = {
  // Email pattern
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  
  // Phone patterns (US formats)
  phone: /(?:\+1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  
  // Social media URLs
  linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9_-]+\/?/gi,
  facebook: /https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+\/?/gi,
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._-]+\/?/gi,
  twitter: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/?/gi,
  
  // Founded year patterns
  foundedYear: /(?:founded|established|since|est\.?)\s*(?:in\s*)?(\d{4})/gi,
  yearInBusiness: /(\d+)\+?\s*years?\s*(?:in\s*business|of\s*experience|serving)/gi,
  familyOwned: /family[- ]owned\s+(?:since\s+)?(\d{4})?/gi,
  generationBusiness: /(\d+)(?:st|nd|rd|th)\s*generation/gi,
  anniversary: /celebrating\s+(\d+)\s*years?/gi,
  
  // Headcount patterns - multiple patterns for different phrasings
  // Pattern 1: "X employees/staff/people" - most common
  headcountDirect: /(\d{1,5})\+?\s*(?:employees?|staff(?:\s+members?)?|team\s+members?|professionals?|technicians?|workers?|specialists?)/gi,
  // Pattern 2: "team of X" / "staff of X" / "workforce of X"
  headcountTeamOf: /(?:team|staff|workforce|crew)\s+of\s+(?:over\s+|more\s+than\s+|approximately\s+|about\s+|around\s+)?(\d{1,5})\+?/gi,
  // Pattern 3: "X-person team" / "X-member staff"
  headcountPersonTeam: /(\d{1,5})\s*-?\s*(?:person|member|man|woman)\s+(?:team|staff|crew|operation)/gi,
  // Pattern 4: "employs X" / "we employ X" / "employing X"
  headcountEmploys: /(?:we\s+)?employ(?:s|ing)?\s+(?:over\s+|more\s+than\s+|approximately\s+|about\s+|around\s+)?(\d{1,5})\+?/gi,
  // Pattern 5: "over/more than X employees"
  headcountOver: /(?:over|more\s+than|approximately|about|around|nearly)\s+(\d{1,5})\+?\s*(?:employees?|staff|team\s+members?|professionals?)/gi,
  // Pattern 6: Range "X-Y employees" - we'll take the higher number
  headcountRange: /(\d{1,5})\s*[-–to]+\s*(\d{1,5})\s*(?:employees?|staff|team\s+members?|professionals?)/gi,
  
  // Acquisition/ownership patterns
  acquired: /acquired\s+by\s+([^,.]+)/gi,
  soldTo: /sold\s+to\s+([^,.]+)/gi,
  merger: /merger\s+with\s+([^,.]+)/gi,
  newOwnership: /(?:under\s+)?new\s+(?:ownership|management)/gi,
  parentCompany: /(?:parent\s+company|subsidiary\s+of)\s+([^,.]+)/gi,
  rebranded: /(?:formerly\s+known\s+as|rebranded\s+(?:from|to))\s+([^,.]+)/gi,
  
  // Team member patterns - CASE SENSITIVE to require proper capitalization
  // Pattern 1: "Name Title" or "Name - Title" or "Name, Title"
  teamMemberWithTitle: /([A-Z][a-z]{1,15}(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]{1,20})[\s,\-–|:]+(?:is\s+(?:the|our)\s+)?(CEO|Owner|President|Founder|Co-Founder|Director|Manager|Chief\s+[A-Z][a-z]+\s+Officer|Vice\s+President|VP\s+of\s+[A-Z][a-z]+|General\s+Manager|Partner|Principal|Broker|Agent)/g,
  
  // New hire patterns
  newHire: /(?:welcome|joins?(?:\s+(?:us|our|the)\s+team)?|new\s+(?:team\s+)?member|recently\s+hired)\s+([^.!?]+)/gi,
  
  // Contact page URL patterns
  contactPage: /\/(?:contact(?:-us)?|get-in-touch|reach-us)\/?$/i,
};

// ============ Name Validation Constants ============

// First names from union of unique-names-generator and US SSA data (9,525 names)
// See: scripts/generate-first-names.ts
export const COMMON_FIRST_NAMES = FIRST_NAMES;

// Words that should NOT appear in names
export const NAME_BLACKLIST = new Set([
  'home', 'business', 'service', 'services', 'company', 'inc', 'llc', 'corp', 'the', 'and', 'for',
  'our', 'your', 'with', 'from', 'that', 'this', 'have', 'been', 'was', 'are', 'were', 'being',
  'colorado', 'california', 'texas', 'florida', 'new', 'york', 'chicago', 'los', 'angeles',
  'property', 'properties', 'real', 'estate', 'construction', 'plumbing', 'heating', 'cooling',
  'electric', 'electrical', 'roofing', 'painting', 'cleaning', 'maintenance', 'repair', 'repairs',
  'give', 'giving', 'providing', 'offers', 'offer', 'plugin', 'website', 'contact', 'about',
  'concerns', 'concern', 'regarding', 'information', 'details', 'more', 'learn', 'read',
  'click', 'here', 'page', 'site', 'web', 'online', 'today', 'now', 'call', 'email',
  'north', 'south', 'east', 'west', 'central', 'metro', 'area', 'region', 'county', 'city',
]);
