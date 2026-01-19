import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { gzipSync } from 'zlib';
import { createRequire } from 'module';
import { EventEmitter } from 'events';
import puppeteer, { Browser } from 'puppeteer';
import { names as firstNamesList } from 'unique-names-generator';

// Increase max listeners to avoid warnings with concurrent requests
EventEmitter.defaultMaxListeners = 50;

// cloudscraper uses CommonJS, need createRequire for ES modules
const require = createRequire(import.meta.url);
const cloudscraper = require('cloudscraper');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
const s3Client = new S3Client({ region: process.env.AWS_REGION });

const BUSINESSES_TABLE_NAME = process.env.BUSINESSES_TABLE_NAME!;
const CAMPAIGN_DATA_BUCKET = process.env.CAMPAIGN_DATA_BUCKET!;
const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME;

// Task resource info for dynamic concurrency calculation
const TASK_MEMORY_MIB = parseInt(process.env.TASK_MEMORY_MIB || '4096', 10);
const TASK_CPU_UNITS = parseInt(process.env.TASK_CPU_UNITS || '1024', 10);

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
function calculateOptimalConcurrency(fastMode: boolean): number {
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

// ============ Types ============

interface FilterRule {
  field: string;
  operator: 'EXISTS' | 'NOT_EXISTS' | 'EQUALS' | 'NOT_EQUALS';
  value?: string;
}

interface JobInput {
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
}

interface Business {
  place_id: string;
  business_name: string;
  website_uri?: string;
  web_scraped?: boolean;
  [key: string]: unknown;
}

interface ScrapedPage {
  url: string;
  title: string;
  html: string;
  text_content: string;
  links: string[];
  status_code: number;
  scraped_at: string;
}

interface TeamMember {
  name: string;
  title: string;
  source_url: string;
}

interface NewHireMention {
  text: string;
  source_url: string;
}

interface AcquisitionSignal {
  text: string;
  signal_type: 'acquired' | 'sold' | 'merger' | 'new_ownership' | 'rebranded';
  date_mentioned?: string;
  source_url: string;
}

interface HistorySnippet {
  text: string;
  source_url: string;
}

interface ExtractedData {
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

interface RawScrapeData {
  place_id: string;
  website_uri: string;
  scraped_at: string;
  scrape_method: 'fetch' | 'cloudscraper' | 'puppeteer';
  duration_ms: number;
  pages: ScrapedPage[];
}

interface ExtractedScrapeData {
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

// ============ Regex Patterns ============

const PATTERNS = {
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

// ============ Extraction Functions ============

function extractEmails(text: string, sourceUrl?: string): string[] {
  const matches = text.match(PATTERNS.email) || [];
  // Filter out common false positives
  const emails = [...new Set(matches.filter(email => 
    !email.includes('example.com') &&
    !email.includes('domain.com') &&
    !email.includes('email.com') &&
    !email.endsWith('.png') &&
    !email.endsWith('.jpg') &&
    !email.endsWith('.gif')
  ))].slice(0, 10); // Max 10 emails
  
  if (emails.length > 0) {
    console.log(`    [Extract:Emails] Found ${emails.length}: ${emails.slice(0, 3).join(', ')}${emails.length > 3 ? '...' : ''}`);
  }
  return emails;
}

/**
 * Normalize a phone number to 10 digits (strip +1 country code)
 */
function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  // Remove US country code prefix if present (11 digits starting with 1)
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  return digits;
}

/**
 * Check if a phone number looks fake/invalid
 * Filters out: repeating digits, sequential patterns, obvious test numbers
 */
function isFakePhone(phone: string): boolean {
  // Must be 10 digits
  if (phone.length !== 10) return true;
  
  // Check for repeating single digit (3333333333)
  if (/^(\d)\1{9}$/.test(phone)) return true;
  
  // Check for mostly same digit (6666666667 - 9+ of same digit)
  const digitCounts: Record<string, number> = {};
  for (const d of phone) {
    digitCounts[d] = (digitCounts[d] || 0) + 1;
  }
  if (Object.values(digitCounts).some(count => count >= 9)) return true;
  
  // Check for repeating 3-digit pattern (7037037037)
  const first3 = phone.slice(0, 3);
  if (phone === first3 + first3 + first3 + first3.slice(0, 1)) return true;
  if (phone === first3.repeat(3) + first3.slice(0, 1)) return true;
  
  // Check for repeating 2-digit pattern (1212121212)
  const first2 = phone.slice(0, 2);
  if (phone === first2.repeat(5)) return true;
  
  // Check for sequential ascending (1234567890)
  if (phone === '1234567890' || phone === '0123456789') return true;
  
  // Check for sequential descending (9876543210)
  if (phone === '9876543210' || phone === '0987654321') return true;
  
  // Common test/fake numbers
  const fakeNumbers = [
    '0000000000', '1111111111', '2222222222', '5555555555',
    '1234567890', '0987654321', '1231231234', '9999999999',
  ];
  if (fakeNumbers.includes(phone)) return true;
  
  // Invalid US area codes (starts with 0 or 1)
  if (phone.startsWith('0') || phone.startsWith('1')) return true;
  
  return false;
}

/**
 * Extract phone numbers from text, excluding known phones and fake numbers
 */
function extractPhones(text: string, knownPhones: string[] = []): string[] {
  const matches = text.match(PATTERNS.phone) || [];
  
  // Normalize known phones for comparison
  const normalizedKnown = new Set(knownPhones.map(normalizePhone));
  
  // Normalize, dedupe, and filter
  const normalized = matches.map(normalizePhone);
  
  const phones = [...new Set(normalized)]
    .filter(p => p.length === 10)
    .filter(p => !normalizedKnown.has(p)) // Exclude already-known phones
    .filter(p => !isFakePhone(p))          // Exclude fake/test numbers
    .slice(0, 5);
  
  if (phones.length > 0) {
    console.log(`    [Extract:Phones] Found ${phones.length}: ${phones.slice(0, 3).join(', ')}${phones.length > 3 ? '...' : ''}`);
  }
  return phones;
}

function extractSocialLinks(html: string): ExtractedData['social'] {
  const social: ExtractedData['social'] = {};
  
  const linkedinMatch = html.match(PATTERNS.linkedin);
  if (linkedinMatch) social.linkedin = linkedinMatch[0];
  
  const facebookMatch = html.match(PATTERNS.facebook);
  if (facebookMatch) social.facebook = facebookMatch[0];
  
  const instagramMatch = html.match(PATTERNS.instagram);
  if (instagramMatch) social.instagram = instagramMatch[0];
  
  const twitterMatch = html.match(PATTERNS.twitter);
  if (twitterMatch) social.twitter = twitterMatch[0];
  
  const found = Object.entries(social).filter(([, v]) => v);
  if (found.length > 0) {
    console.log(`    [Extract:Social] Found: ${found.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  
  return social;
}

function extractFoundedYear(text: string): { year: number | null; source: string | null } {
  const currentYear = new Date().getFullYear();
  
  // Try direct founded/established patterns
  const foundedMatches = [...text.matchAll(PATTERNS.foundedYear)];
  for (const match of foundedMatches) {
    const year = parseInt(match[1], 10);
    if (year >= 1800 && year <= currentYear) {
      console.log(`    [Extract:Founded] Year ${year} from: "${match[0].trim()}"`);
      return { year, source: match[0] };
    }
  }
  
  // Try "X years in business" patterns
  const yearsMatches = [...text.matchAll(PATTERNS.yearInBusiness)];
  for (const match of yearsMatches) {
    const years = parseInt(match[1], 10);
    if (years > 0 && years < 200) {
      const foundedYear = currentYear - years;
      console.log(`    [Extract:Founded] Year ~${foundedYear} (${years} years) from: "${match[0].trim()}"`);
      return { year: foundedYear, source: match[0] };
    }
  }
  
  // Try anniversary patterns
  const anniversaryMatches = [...text.matchAll(PATTERNS.anniversary)];
  for (const match of anniversaryMatches) {
    const years = parseInt(match[1], 10);
    if (years > 0 && years < 200) {
      const foundedYear = currentYear - years;
      console.log(`    [Extract:Founded] Year ~${foundedYear} (${years} years anniversary) from: "${match[0].trim()}"`);
      return { year: foundedYear, source: match[0] };
    }
  }
  
  // Try family-owned patterns
  const familyMatches = [...text.matchAll(PATTERNS.familyOwned)];
  for (const match of familyMatches) {
    if (match[1]) {
      const year = parseInt(match[1], 10);
      if (year >= 1800 && year <= currentYear) {
        console.log(`    [Extract:Founded] Year ${year} (family-owned) from: "${match[0].trim()}"`);
        return { year, source: match[0] };
      }
    }
  }
  
  return { year: null, source: null };
}

function extractHeadcount(text: string): { estimate: number | null; source: string | null } {
  // Try each pattern in order of reliability
  const patterns = [
    { pattern: PATTERNS.headcountDirect, name: 'direct', group: 1 },
    { pattern: PATTERNS.headcountTeamOf, name: 'team-of', group: 1 },
    { pattern: PATTERNS.headcountEmploys, name: 'employs', group: 1 },
    { pattern: PATTERNS.headcountOver, name: 'over', group: 1 },
    { pattern: PATTERNS.headcountPersonTeam, name: 'person-team', group: 1 },
  ];
  
  // Collect all matches with their counts
  const candidates: Array<{ count: number; source: string; pattern: string }> = [];
  
  for (const { pattern, name, group } of patterns) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      if (match[group]) {
        const count = parseInt(match[group], 10);
        // Valid range: 2-10000 (filter out "1 employee" which is often false positive)
        if (count >= 2 && count <= 10000) {
          candidates.push({ count, source: match[0].trim(), pattern: name });
        }
      }
    }
  }
  
  // Try range pattern separately (take higher number)
  PATTERNS.headcountRange.lastIndex = 0;
  const rangeMatches = [...text.matchAll(PATTERNS.headcountRange)];
  for (const match of rangeMatches) {
    const low = parseInt(match[1], 10);
    const high = parseInt(match[2], 10);
    if (high >= 2 && high <= 10000 && high > low) {
      // Use the higher number as the estimate
      candidates.push({ count: high, source: match[0].trim(), pattern: 'range' });
    }
  }
  
  if (candidates.length === 0) {
    return { estimate: null, source: null };
  }
  
  // If we have multiple candidates, prefer:
  // 1. Most common count (if same count appears multiple times)
  // 2. Higher counts (more specific "50 employees" vs generic numbers)
  // 3. First match
  
  // Count occurrences
  const countFrequency: Record<number, number> = {};
  for (const c of candidates) {
    countFrequency[c.count] = (countFrequency[c.count] || 0) + 1;
  }
  
  // Sort by frequency (desc), then by count (desc)
  candidates.sort((a, b) => {
    const freqDiff = (countFrequency[b.count] || 0) - (countFrequency[a.count] || 0);
    if (freqDiff !== 0) return freqDiff;
    return b.count - a.count;
  });
  
  const best = candidates[0];
  console.log(`    [Extract:Headcount] ~${best.count} employees from: "${best.source}" (${best.pattern})`);
  return { estimate: best.count, source: best.source };
}

// Build a set from unique-names-generator (4940 first names) for O(1) lookup
// Import is at top of file
const COMMON_FIRST_NAMES = new Set(firstNamesList.map(n => n.toLowerCase()));

// Words that should NOT appear in names
const NAME_BLACKLIST = new Set([
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

/**
 * Check if a string looks like a real person's name
 */
function isValidPersonName(name: string): boolean {
  const parts = name.trim().split(/\s+/);
  
  // Must have 2-4 parts (first + last, or first + middle + last, etc.)
  if (parts.length < 2 || parts.length > 4) return false;
  
  // Check first name against common names list
  const firstName = parts[0].toLowerCase();
  if (!COMMON_FIRST_NAMES.has(firstName)) return false;
  
  // Check that no part is blacklisted
  for (const part of parts) {
    if (NAME_BLACKLIST.has(part.toLowerCase())) return false;
  }
  
  // Each part should be properly capitalized (first letter upper, rest lower)
  for (const part of parts) {
    // Allow single initials like "J." or "A"
    if (part.length <= 2) continue;
    // Must start with uppercase
    if (!/^[A-Z]/.test(part)) return false;
    // Rest should be mostly lowercase (allow O'Brien, McDonald, etc.)
    if (!/^[A-Z][a-z']+$/.test(part) && !/^[A-Z][a-z]*[A-Z][a-z]+$/.test(part)) return false;
  }
  
  // Last name should be at least 2 characters
  const lastName = parts[parts.length - 1];
  if (lastName.length < 2) return false;
  
  return true;
}

function extractTeamMembers(text: string, sourceUrl: string): TeamMember[] {
  const members: TeamMember[] = [];
  
  // Reset regex
  PATTERNS.teamMemberWithTitle.lastIndex = 0;
  const matches = [...text.matchAll(PATTERNS.teamMemberWithTitle)];
  
  for (const match of matches) {
    const name = match[1]?.trim();
    const title = match[2]?.trim();
    
    if (!name || !title) continue;
    
    // Validate the name looks like a real person
    if (!isValidPersonName(name)) {
      continue;
    }
    
    members.push({ name, title, source_url: sourceUrl });
  }
  
  const result = members.slice(0, 20); // Max 20 team members
  if (result.length > 0) {
    console.log(`    [Extract:Team] Found ${result.length} members: ${result.slice(0, 3).map(m => `${m.name} (${m.title})`).join(', ')}${result.length > 3 ? '...' : ''}`);
  }
  return result;
}

function extractNewHires(text: string, sourceUrl: string): NewHireMention[] {
  const mentions: NewHireMention[] = [];
  const matches = [...text.matchAll(PATTERNS.newHire)];
  
  for (const match of matches) {
    const context = match[0]?.trim();
    if (context && context.length > 10 && context.length < 200) {
      mentions.push({ text: context, source_url: sourceUrl });
    }
  }
  
  const result = mentions.slice(0, 10);
  if (result.length > 0) {
    console.log(`    [Extract:NewHires] Found ${result.length}: "${result[0].text.slice(0, 50)}..."`);
  }
  return result;
}

function extractAcquisitionSignals(text: string, sourceUrl: string): AcquisitionSignal[] {
  const signals: AcquisitionSignal[] = [];
  
  // Check each pattern
  const patterns: Array<{ regex: RegExp; type: AcquisitionSignal['signal_type'] }> = [
    { regex: PATTERNS.acquired, type: 'acquired' },
    { regex: PATTERNS.soldTo, type: 'sold' },
    { regex: PATTERNS.merger, type: 'merger' },
    { regex: PATTERNS.newOwnership, type: 'new_ownership' },
    { regex: PATTERNS.rebranded, type: 'rebranded' },
  ];
  
  for (const { regex, type } of patterns) {
    const matches = [...text.matchAll(regex)];
    for (const match of matches) {
      // Try to find a nearby year
      const context = text.substring(
        Math.max(0, match.index! - 50),
        Math.min(text.length, match.index! + match[0].length + 50)
      );
      const yearMatch = context.match(/\b(20\d{2}|19\d{2})\b/);
      
      signals.push({
        text: match[0].trim(),
        signal_type: type,
        date_mentioned: yearMatch?.[1],
        source_url: sourceUrl,
      });
    }
  }
  
  const result = signals.slice(0, 10);
  if (result.length > 0) {
    console.log(`    [Extract:Acquisition] Found ${result.length} signals: ${result.map(s => `${s.signal_type}${s.date_mentioned ? ` (${s.date_mentioned})` : ''}`).join(', ')}`);
  }
  return result;
}

function extractHistorySnippets(text: string, sourceUrl: string): HistorySnippet[] {
  const snippets: HistorySnippet[] = [];
  const historyKeywords = ['history', 'story', 'founded', 'established', 'began', 'started', 'heritage', 'tradition', 'legacy'];
  
  // Split into sentences
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (historyKeywords.some(kw => lower.includes(kw))) {
      snippets.push({
        text: sentence.trim().slice(0, 300),
        source_url: sourceUrl,
      });
    }
  }
  
  const result = snippets.slice(0, 5);
  if (result.length > 0) {
    console.log(`    [Extract:History] Found ${result.length} snippets: "${result[0].text.slice(0, 60)}..."`);
  }
  return result;
}

function findContactPageUrl(pages: ScrapedPage[]): string | null {
  for (const page of pages) {
    if (PATTERNS.contactPage.test(page.url)) {
      console.log(`    [Extract:ContactPage] Found: ${page.url}`);
      return page.url;
    }
  }
  return null;
}

// ============ Scraping Functions ============

function extractTextContent(html: string): string {
  // Remove scripts, styles, and comments
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  
  return text;
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1]?.trim() || '';
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const linkRegex = /href=["']([^"']+)["']/gi;
  let match;
  
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const href = match[1];
      if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        continue;
      }
      
      const absoluteUrl = new URL(href, baseUrl).href;
      links.push(absoluteUrl);
    } catch {
      // Invalid URL, skip
    }
  }
  
  return [...new Set(links)];
}

function isSameDomain(url1: string, url2: string): boolean {
  try {
    const host1 = new URL(url1).hostname.replace(/^www\./, '');
    const host2 = new URL(url2).hostname.replace(/^www\./, '');
    return host1 === host2;
  } catch {
    return false;
  }
}

function needsPuppeteer(html: string): boolean {
  const textContent = extractTextContent(html);
  
  // Check if body is too short
  if (textContent.length < 500) {
    return true;
  }
  
  // Check for SPA patterns
  const spaPatterns = [
    /<div\s+id=["']root["'][^>]*>\s*<\/div>/i,
    /<div\s+id=["']app["'][^>]*>\s*<\/div>/i,
    /<div\s+id=["']__next["'][^>]*>\s*<\/div>/i,
    /Loading\.\.\./i,
    /<noscript[^>]*>.*(?:enable|requires?)\s+JavaScript/i,
  ];
  
  for (const pattern of spaPatterns) {
    if (pattern.test(html)) {
      return true;
    }
  }
  
  return false;
}

interface CloudscraperResponse {
  body: string;
  statusCode: number;
}

/**
 * Fetch a URL using cloudscraper to bypass Cloudflare protection
 */
async function fetchWithCloudscraper(url: string, timeoutMs: number = 10000): Promise<CloudscraperResponse> {
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

async function scrapePage(url: string, browser: Browser | null): Promise<{ page: ScrapedPage; method: 'cloudscraper' | 'puppeteer' } | null> {
  try {
    // First, try cloudscraper (handles Cloudflare protection)
    let html: string;
    let statusCode: number;
    let usedPuppeteer = false;
    
    try {
      const response = await fetchWithCloudscraper(url);
      html = response.body;
      statusCode = response.statusCode;
      
      if (statusCode >= 400) {
        console.log(`  [${statusCode}] ${url}`);
        return null;
      }
    } catch (cloudscraperError) {
      // If cloudscraper fails (e.g., advanced protection), try Puppeteer
      if (browser) {
        console.log(`  [Cloudscraper failed] ${url} - trying Puppeteer: ${cloudscraperError}`);
        try {
          const page = await browser.newPage();
          await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          html = await page.content();
          statusCode = 200;
          await page.close();
          usedPuppeteer = true;
        } catch (puppeteerError) {
          console.log(`  [Puppeteer error] ${url}: ${puppeteerError}`);
          return null;
        }
      } else {
        console.log(`  [Error] ${url}: ${cloudscraperError}`);
        return null;
      }
    }
    
    // Check if we need Puppeteer for JavaScript rendering
    if (!usedPuppeteer && browser && needsPuppeteer(html)) {
      console.log(`  [JS] ${url} - needs Puppeteer for rendering`);
      
      try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        html = await page.content();
        await page.close();
        usedPuppeteer = true;
      } catch (error) {
        console.log(`  [Puppeteer error] ${url}: ${error}`);
        // Fall back to cloudscraper HTML
      }
    }
    
    const textContent = extractTextContent(html);
    const title = extractTitle(html);
    const links = extractLinks(html, url);
    
    const method = usedPuppeteer ? 'puppeteer' : 'cloudscraper';
    console.log(`  [${method}] ${url} - ${textContent.length} chars, ${links.length} links`);
    
    return {
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
    };
  } catch (error) {
    console.log(`  [Error] ${url}: ${error}`);
    return null;
  }
}

async function scrapeWebsite(
  websiteUri: string,
  maxPages: number,
  browser: Browser | null
): Promise<{ pages: ScrapedPage[]; method: 'cloudscraper' | 'puppeteer'; cloudscraperCount: number; puppeteerCount: number }> {
  const visited = new Set<string>();
  const toVisit: string[] = [websiteUri];
  const pages: ScrapedPage[] = [];
  let cloudscraperCount = 0;
  let puppeteerCount = 0;
  
  // Priority pages to visit first
  const priorityPaths = [
    '/about', '/about-us', '/about-us/', '/about/',
    '/contact', '/contact-us', '/contact-us/', '/contact/',
    '/team', '/our-team', '/staff', '/leadership', '/people',
    '/news', '/blog', '/press',
  ];
  
  while (toVisit.length > 0 && pages.length < maxPages) {
    const url = toVisit.shift()!;
    
    // Normalize URL
    let normalizedUrl: string;
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      // Remove tracking params
      parsed.searchParams.delete('utm_source');
      parsed.searchParams.delete('utm_medium');
      parsed.searchParams.delete('utm_campaign');
      normalizedUrl = parsed.href;
    } catch {
      continue;
    }
    
    if (visited.has(normalizedUrl)) {
      continue;
    }
    
    // Only scrape same-domain URLs
    if (!isSameDomain(normalizedUrl, websiteUri)) {
      continue;
    }
    
    // Skip common non-content URLs
    const skipPatterns = [
      // WordPress junk
      /\/wp-json\//i,
      /\/wp-includes\//i,
      /\/wp-content\/plugins\//i,
      /\/wp-content\/themes\//i,
      /\/wp-content\/uploads\//i,
      /\/wp-admin\//i,
      /\/xmlrpc\.php/i,
      /\/wp-login\.php/i,
      /\/feed\/?$/i,
      /\/comments\/feed\//i,
      /\/trackback\//i,
      
      // Static assets
      /\.css(\?.*)?$/i,
      /\.js(\?.*)?$/i,
      /\.woff2?(\?.*)?$/i,
      /\.ttf(\?.*)?$/i,
      /\.ico(\?.*)?$/i,
      /\.svg(\?.*)?$/i,
      /\.png(\?.*)?$/i,
      /\.jpg(\?.*)?$/i,
      /\.jpeg(\?.*)?$/i,
      /\.gif(\?.*)?$/i,
      /\.webp(\?.*)?$/i,
      /\.pdf$/i,
      /\.doc$/i,
      /\.docx$/i,
      /\.xls$/i,
      /\.xlsx$/i,
      /\.zip$/i,
      /\.rar$/i,
      /\.exe$/i,
      /\.dmg$/i,
      /\.mp3$/i,
      /\.mp4$/i,
      /\.wav$/i,
      /\.avi$/i,
      /\.mov$/i,
      /\.wmv$/i,
      /\.json$/i,
      /\.xml$/i,
      
      // Wix garbage
      /\/copy-of-/i,
      /\/_api\//i,
      /\/wix-/i,
      
      // Squarespace
      /\/api\//i,
      /\/static\//i,
      
      // Common junk
      /\/cdn-cgi\//i,           // Cloudflare
      /\/oembed/i,
      /\?replytocom=/i,         // WP comment replies
      /\/attachment\//i,
      /\/author\//i,            // usually low value
      /\/tag\//i,               // often duplicate content
      /\/category\//i,          // same
      /\/page\/\d+/i,           // pagination
      /#.*$/i,                  // anchors
      /\?share=/i,              // social sharing URLs
      /\?print=/i,              // print versions
      /\/print\//i,
      /\/amp\/?$/i,             // AMP versions
      /\/embed\/?$/i,
      /\/login/i,
      /\/register/i,
      /\/cart/i,
      /\/checkout/i,
      /\/my-account/i,
      /\/search/i,
      /\?s=/i,                  // search queries
      /\?p=\d+/i,               // WP preview links
      /\/calendar\//i,
      /\/events\//i,            // often noisy
      /\/rss\/?$/i,
    ];
    
    if (skipPatterns.some(p => p.test(normalizedUrl))) {
      continue;
    }
    
    visited.add(normalizedUrl);
    
    const result = await scrapePage(normalizedUrl, browser);
    
    if (result) {
      pages.push(result.page);
      
      // Track which method was used
      if (result.method === 'puppeteer') {
        puppeteerCount++;
      } else {
        cloudscraperCount++;
      }
      
      // Add links to queue if page has enough content
      if (result.page.text_content.length > 500) {
        // Add links to queue, prioritizing important pages
        const sameDomainLinks = result.page.links.filter(link => isSameDomain(link, websiteUri));
        
        // Sort by priority
        const prioritized = sameDomainLinks.sort((a, b) => {
          const aPath = new URL(a).pathname.toLowerCase();
          const bPath = new URL(b).pathname.toLowerCase();
          const aScore = priorityPaths.findIndex(p => aPath.includes(p));
          const bScore = priorityPaths.findIndex(p => bPath.includes(p));
          
          if (aScore !== -1 && bScore === -1) return -1;
          if (bScore !== -1 && aScore === -1) return 1;
          if (aScore !== -1 && bScore !== -1) return aScore - bScore;
          return 0;
        });
        
        toVisit.push(...prioritized);
      }
    }
    
    // Minimal delay between requests (50ms instead of 200ms for speed)
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  // Determine primary method used (whichever was used more)
  const primaryMethod = puppeteerCount > cloudscraperCount ? 'puppeteer' : 'cloudscraper';
  
  return { pages, method: primaryMethod, cloudscraperCount, puppeteerCount };
}

// ============ Data Processing ============

function extractAllData(pages: ScrapedPage[], knownPhones: string[] = []): ExtractedData {
  const allEmails = new Set<string>();
  const allPhones = new Set<string>();
  const allSocial: ExtractedData['social'] = {};
  const allTeamMembers: TeamMember[] = [];
  const allNewHires: NewHireMention[] = [];
  const allAcquisitionSignals: AcquisitionSignal[] = [];
  const allHistorySnippets: HistorySnippet[] = [];
  let foundedYear: number | null = null;
  let foundedSource: string | null = null;
  let headcountEstimate: number | null = null;
  let headcountSource: string | null = null;
  
  // Process pages in priority order
  // Sort by URL to prioritize about/contact/team pages
  const sortedPages = [...pages].sort((a, b) => {
    const priorityPaths = ['about', 'contact', 'team', 'staff', 'leadership'];
    const aPath = a.url.toLowerCase();
    const bPath = b.url.toLowerCase();
    
    for (const path of priorityPaths) {
      const aHas = aPath.includes(path);
      const bHas = bPath.includes(path);
      if (aHas && !bHas) return -1;
      if (bHas && !aHas) return 1;
    }
    return 0;
  });
  
  console.log(`  [Extraction] Processing ${sortedPages.length} pages...`);
  
  for (const page of sortedPages) {
    const text = page.text_content;
    const html = page.html;
    
    console.log(`   [Page] ${page.url} (${text.length} chars)`);
    
    // Extract emails
    extractEmails(text).forEach(e => allEmails.add(e));
    
    // Extract phones (excluding known phones from Google)
    extractPhones(text, knownPhones).forEach(p => allPhones.add(p));
    
    // Extract social links
    const social = extractSocialLinks(html);
    if (social.linkedin && !allSocial.linkedin) allSocial.linkedin = social.linkedin;
    if (social.facebook && !allSocial.facebook) allSocial.facebook = social.facebook;
    if (social.instagram && !allSocial.instagram) allSocial.instagram = social.instagram;
    if (social.twitter && !allSocial.twitter) allSocial.twitter = social.twitter;
    
    // Extract founded year (first match wins)
    if (!foundedYear) {
      const { year, source } = extractFoundedYear(text);
      if (year) {
        foundedYear = year;
        foundedSource = source;
      }
    }
    
    // Extract headcount (first match wins)
    if (!headcountEstimate) {
      const { estimate, source } = extractHeadcount(text);
      if (estimate) {
        headcountEstimate = estimate;
        headcountSource = source;
      }
    }
    
    // Extract team members
    allTeamMembers.push(...extractTeamMembers(text, page.url));
    
    // Extract new hires
    allNewHires.push(...extractNewHires(text, page.url));
    
    // Extract acquisition signals
    allAcquisitionSignals.push(...extractAcquisitionSignals(text, page.url));
    
    // Extract history snippets
    allHistorySnippets.push(...extractHistorySnippets(text, page.url));
  }
  
  // Calculate years in business
  const yearsInBusiness = foundedYear ? new Date().getFullYear() - foundedYear : null;
  
  // Build acquisition summary
  let acquisitionSummary: string | null = null;
  if (allAcquisitionSignals.length > 0) {
    const signal = allAcquisitionSignals[0];
    acquisitionSummary = signal.date_mentioned 
      ? `${signal.text} (${signal.date_mentioned})`
      : signal.text;
  }
  
  const contactPageUrl = findContactPageUrl(pages);
  const dedupedTeamMembers = dedupeTeamMembers(allTeamMembers);
  
  // Log extraction summary
  console.log(`  [Extraction Summary]`);
  console.log(`    Emails: ${allEmails.size}, Phones: ${allPhones.size}`);
  console.log(`    Social: ${Object.keys(allSocial).filter(k => allSocial[k as keyof typeof allSocial]).length} profiles`);
  console.log(`    Team members: ${dedupedTeamMembers.length}, Headcount: ${headcountEstimate || 'unknown'}`);
  console.log(`    Founded: ${foundedYear || 'unknown'}, Years in business: ${yearsInBusiness || 'unknown'}`);
  console.log(`    Acquisition signals: ${allAcquisitionSignals.length}, History snippets: ${allHistorySnippets.length}`);
  
  return {
    emails: [...allEmails],
    phones: [...allPhones],
    contact_page_url: contactPageUrl,
    social: allSocial,
    team_members: dedupedTeamMembers,
    headcount_estimate: headcountEstimate,
    headcount_source: headcountSource,
    new_hire_mentions: allNewHires.slice(0, 10),
    acquisition_signals: allAcquisitionSignals.slice(0, 10),
    has_acquisition_signal: allAcquisitionSignals.length > 0,
    acquisition_summary: acquisitionSummary,
    founded_year: foundedYear,
    founded_source: foundedSource,
    years_in_business: yearsInBusiness,
    history_snippets: allHistorySnippets.slice(0, 5),
  };
}

function dedupeTeamMembers(members: TeamMember[]): TeamMember[] {
  const seen = new Set<string>();
  const unique: TeamMember[] = [];
  
  for (const member of members) {
    const key = member.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(member);
    }
  }
  
  return unique.slice(0, 20);
}

// ============ S3 and DynamoDB Functions ============

async function uploadToS3(
  bucket: string,
  key: string,
  data: object
): Promise<void> {
  const json = JSON.stringify(data);
  const compressed = gzipSync(Buffer.from(json), { level: 9 });
  
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: compressed,
    ContentType: 'application/json',
    ContentEncoding: 'gzip',
  }));
}

async function updateBusinessWithScrapeData(
  placeId: string,
  rawS3Key: string,
  extractedS3Key: string,
  scrapeMethod: 'cloudscraper' | 'puppeteer',
  pagesCount: number,
  totalBytes: number,
  durationMs: number,
  errors: number,
  extracted: ExtractedData
): Promise<void> {
  const updateFields: Record<string, unknown> = {
    // Core scrape status
    web_scraped: true,
    web_scraped_at: new Date().toISOString(),
    
    // S3 references
    web_raw_s3_key: rawS3Key,
    web_extracted_s3_key: extractedS3Key,
    
    // Scrape metadata
    web_pages_count: pagesCount,
    web_scrape_method: scrapeMethod,
    web_total_bytes: totalBytes,
    web_scrape_duration_ms: durationMs,
    web_scrape_errors: errors,
    web_scrape_status: errors === 0 ? 'complete' : (pagesCount > 0 ? 'partial' : 'failed'),
    
    // Contact information
    web_emails: extracted.emails,
    web_phones: extracted.phones,
    web_contact_page: extracted.contact_page_url,
    web_social_linkedin: extracted.social.linkedin || null,
    web_social_facebook: extracted.social.facebook || null,
    web_social_instagram: extracted.social.instagram || null,
    web_social_twitter: extracted.social.twitter || null,
    
    // Team/employee data
    web_team_members: extracted.team_members.length > 0 ? JSON.stringify(extracted.team_members) : null,
    web_team_count: extracted.team_members.length,
    web_headcount_estimate: extracted.headcount_estimate,
    web_headcount_source: extracted.headcount_source,
    web_new_hires: extracted.new_hire_mentions.length > 0 ? JSON.stringify(extracted.new_hire_mentions) : null,
    web_has_team_page: extracted.team_members.length > 0,
    
    // Acquisition signals
    web_acquisition_signals: extracted.acquisition_signals.length > 0 ? JSON.stringify(extracted.acquisition_signals) : null,
    web_has_acquisition_signal: extracted.has_acquisition_signal,
    web_ownership_note: extracted.acquisition_summary,
    
    // Business history
    web_founded_year: extracted.founded_year,
    web_founded_source: extracted.founded_source,
    web_years_in_business: extracted.years_in_business,
    web_history_snippets: extracted.history_snippets.length > 0 ? JSON.stringify(extracted.history_snippets) : null,
    
    // Pipeline status
    pipeline_status: 'scraped',
  };
  
  // Build update expression
  const updateParts: string[] = [];
  const expressionNames: Record<string, string> = {};
  const expressionValues: Record<string, unknown> = {};
  
  Object.entries(updateFields).forEach(([key, value], index) => {
    if (value !== undefined) {
      updateParts.push(`#attr${index} = :val${index}`);
      expressionNames[`#attr${index}`] = key;
      expressionValues[`:val${index}`] = value;
    }
  });
  
  try {
    await docClient.send(new UpdateCommand({
      TableName: BUSINESSES_TABLE_NAME,
      Key: { place_id: placeId },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
    }));
    console.log(`  [DynamoDB] Updated ${placeId} with ${updateParts.length} fields`);
  } catch (error) {
    console.error(`  [DynamoDB ERROR] Failed to update ${placeId}:`, error);
    throw error;
  }
}

// ============ Filter Rule Helpers ============

function buildFilterFromRules(
  rules: FilterRule[],
  baseExpression: string,
  existingNames: Record<string, string> = {},
  existingValues: Record<string, unknown> = {}
): {
  expression: string;
  names: Record<string, string>;
  values: Record<string, unknown>;
} {
  const names = { ...existingNames };
  const values = { ...existingValues };
  const conditions: string[] = baseExpression ? [baseExpression] : [];
  
  rules.forEach((rule, index) => {
    const fieldAlias = `#filterField${index}`;
    const valueAlias = `:filterVal${index}`;
    names[fieldAlias] = rule.field;
    
    switch (rule.operator) {
      case 'EXISTS':
        conditions.push(`attribute_exists(${fieldAlias})`);
        break;
      case 'NOT_EXISTS':
        conditions.push(`attribute_not_exists(${fieldAlias})`);
        break;
      case 'EQUALS':
        values[valueAlias] = rule.value;
        conditions.push(`${fieldAlias} = ${valueAlias}`);
        break;
      case 'NOT_EQUALS':
        values[valueAlias] = rule.value;
        conditions.push(`${fieldAlias} <> ${valueAlias}`);
        break;
    }
  });
  
  return {
    expression: conditions.join(' AND '),
    names,
    values,
  };
}

async function getBusinessesToScrape(
  placeIds?: string[],
  filterRules: FilterRule[] = [],
  skipIfDone: boolean = true,
  forceRescrape: boolean = false
): Promise<Business[]> {
  const businesses: Business[] = [];
  let lastKey: Record<string, unknown> | undefined;
  
  // Base filter: must have website_uri
  let baseExpression = 'attribute_exists(website_uri)';
  const baseValues: Record<string, unknown> = {};
  
  if (skipIfDone && !forceRescrape) {
    baseExpression += ' AND (attribute_not_exists(web_scraped) OR web_scraped = :false)';
    baseValues[':false'] = false;
  }
  
  // Build filter with rules
  const { expression, names, values } = buildFilterFromRules(
    filterRules,
    placeIds ? '' : baseExpression,
    {},
    placeIds ? {} : baseValues
  );
  
  do {
    const command = new ScanCommand({
      TableName: BUSINESSES_TABLE_NAME,
      FilterExpression: expression || undefined,
      ExpressionAttributeNames: Object.keys(names).length > 0 ? names : undefined,
      ExpressionAttributeValues: Object.keys(values).length > 0 ? values : undefined,
      ExclusiveStartKey: lastKey,
    });
    
    const result = await docClient.send(command);
    const items = (result.Items || []) as Business[];
    
    if (placeIds) {
      // Filter to specific IDs and apply base conditions
      businesses.push(...items.filter(b => {
        if (!placeIds.includes(b.place_id)) return false;
        if (!b.website_uri) return false;
        if (skipIfDone && !forceRescrape && b.web_scraped) return false;
        return true;
      }));
    } else {
      businesses.push(...items);
    }
    
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  return businesses;
}

// ============ Job Metrics ============

interface ScrapeMetrics {
  processed: number;
  failed: number;
  filtered: number;
  cloudscraper_count: number;
  puppeteer_count: number;
  total_pages: number;
  total_bytes: number;
}

/**
 * Update job metrics in DynamoDB
 */
async function updateJobMetrics(
  jobId: string, 
  metrics: ScrapeMetrics
): Promise<void> {
  if (!JOBS_TABLE_NAME) {
    console.warn('JOBS_TABLE_NAME not set, skipping metrics update');
    return;
  }
  
  try {
    await docClient.send(new UpdateCommand({
      TableName: JOBS_TABLE_NAME,
      Key: { job_id: jobId },
      UpdateExpression: 'SET metrics.#step = :metrics',
      ExpressionAttributeNames: { '#step': 'scrape' },
      ExpressionAttributeValues: { ':metrics': metrics },
    }));
    console.log(`Updated job metrics for ${jobId}`);
  } catch (error) {
    console.error('Failed to update job metrics:', error);
  }
}

// ============ Main ============

async function main(): Promise<void> {
  console.log('=== Scrape Task (Cloudscraper with Puppeteer Fallback) ===');
  console.log(`Table: ${BUSINESSES_TABLE_NAME}`);
  console.log(`Bucket: ${CAMPAIGN_DATA_BUCKET}`);
  
  // Parse job input
  const jobInputStr = process.env.JOB_INPUT;
  let jobInput: JobInput = {};
  
  if (jobInputStr) {
    try {
      jobInput = JSON.parse(jobInputStr);
      console.log('Parsed JOB_INPUT:', JSON.stringify(jobInput, null, 2));
    } catch (e) {
      console.warn('Could not parse JOB_INPUT, using defaults');
    }
  } else {
    console.log('No JOB_INPUT provided, using defaults');
  }
  
  const jobId = jobInput.jobId;
  const maxPagesPerSite = jobInput.maxPagesPerSite || 10; // Reduced from 20 - most value is in first pages
  const skipIfDone = jobInput.skipIfDone !== false;
  const forceRescrape = jobInput.forceRescrape || false;
  const filterRules = jobInput.filterRules || [];
  const placeIds = jobInput.placeIds;
  const fastMode = jobInput.fastMode || false; // Skip Puppeteer for max speed
  
  // Calculate optimal concurrency based on task resources
  const calculatedConcurrency = calculateOptimalConcurrency(fastMode);
  const concurrency = jobInput.concurrency || calculatedConcurrency;
  
  console.log(`Task resources: ${TASK_MEMORY_MIB}MB memory, ${TASK_CPU_UNITS} CPU units`);
  console.log(`Calculated optimal concurrency: ${calculatedConcurrency}`);
  console.log(`Using concurrency: ${concurrency}`);
  console.log(`Max pages per site: ${maxPagesPerSite}`);
  console.log(`Skip if already scraped: ${skipIfDone}`);
  console.log(`Force re-scrape: ${forceRescrape}`);
  console.log(`Fast mode (no Puppeteer): ${fastMode}`);
  console.log(`Filter rules: ${filterRules.length > 0 ? JSON.stringify(filterRules) : 'none'}`);
  console.log(`Place IDs filter: ${placeIds ? `${placeIds.length} IDs: ${placeIds.slice(0, 5).join(', ')}${placeIds.length > 5 ? '...' : ''}` : 'none (scanning all)'}`);
  
  // Get businesses to scrape
  const businesses = await getBusinessesToScrape(placeIds, filterRules, skipIfDone, forceRescrape);
  console.log(`Found ${businesses.length} businesses to scrape`);
  
  if (businesses.length === 0) {
    console.log('No businesses need scraping. Exiting.');
    return;
  }
  
  // Launch Puppeteer browser (shared across all scrapes) - skip in fast mode
  let browser: Browser | null = null;
  
  if (!fastMode) {
    console.log('Launching Puppeteer browser...');
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      console.log('Browser launched successfully');
    } catch (error) {
      console.warn('Failed to launch Puppeteer, will use cloudscraper only:', error);
    }
  } else {
    console.log('Fast mode enabled - skipping Puppeteer for maximum speed');
  }
  
  // Process businesses
  let processed = 0;
  let failed = 0;
  let totalPages = 0;
  let totalBytes = 0;
  let cloudscraperCount = 0;
  let puppeteerCount = 0;
  
  for (let i = 0; i < businesses.length; i += concurrency) {
    const batch = businesses.slice(i, i + concurrency);
    
    await Promise.all(batch.map(async (business) => {
      const startTime = Date.now();
      
      try {
        console.log(`\nScraping: ${business.business_name} (${business.website_uri})`);
        
        const { pages, method, cloudscraperCount: siteCloudscraperCount, puppeteerCount: sitePuppeteerCount } = await scrapeWebsite(business.website_uri!, maxPagesPerSite, browser);
        
        if (pages.length === 0) {
          console.log(`  ✗ No pages scraped for ${business.business_name}`);
          // Mark as scraped (failed) so we don't retry indefinitely
          try {
            await docClient.send(new UpdateCommand({
              TableName: BUSINESSES_TABLE_NAME,
              Key: { place_id: business.place_id },
              UpdateExpression: 'SET web_scraped = :true, web_scrape_status = :status, web_scraped_at = :at',
              ExpressionAttributeValues: {
                ':true': true,
                ':status': 'failed',
                ':at': new Date().toISOString(),
              },
            }));
            console.log(`  Updated ${business.place_id} with failed status`);
          } catch (updateError) {
            console.error(`  Failed to update failed status for ${business.place_id}:`, updateError);
          }
          failed++;
          return;
        }
        
        const durationMs = Date.now() - startTime;
        const pageBytes = pages.reduce((sum, p) => sum + p.html.length, 0);
        
        // Extract data (pass known phone to exclude from scraped phones)
        const knownPhones: string[] = [];
        if (business.phone) knownPhones.push(String(business.phone));
        if (business.international_phone) knownPhones.push(String(business.international_phone));
        const extracted = extractAllData(pages, knownPhones);
        
        // Create S3 keys
        const timestamp = Date.now();
        const baseKey = `scraped-data/${business.place_id}/${timestamp}`;
        const rawS3Key = `${baseKey}/raw.json.gz`;
        const extractedS3Key = `${baseKey}/extracted.json.gz`;
        
        // Prepare raw data
        const rawData: RawScrapeData = {
          place_id: business.place_id,
          website_uri: business.website_uri!,
          scraped_at: new Date().toISOString(),
          scrape_method: method,
          duration_ms: durationMs,
          pages,
        };
        
        // Prepare extracted data
        const extractedData: ExtractedScrapeData = {
          place_id: business.place_id,
          website_uri: business.website_uri!,
          extracted_at: new Date().toISOString(),
          contacts: {
            emails: extracted.emails,
            phones: extracted.phones,
            contact_page_url: extracted.contact_page_url,
            social: extracted.social,
          },
          team: {
            members: extracted.team_members,
            headcount_estimate: extracted.headcount_estimate,
            headcount_source: extracted.headcount_source,
            new_hire_mentions: extracted.new_hire_mentions,
          },
          acquisition: {
            signals: extracted.acquisition_signals,
            has_signal: extracted.has_acquisition_signal,
            summary: extracted.acquisition_summary,
          },
          history: {
            founded_year: extracted.founded_year,
            founded_source: extracted.founded_source,
            years_in_business: extracted.years_in_business,
            snippets: extracted.history_snippets,
          },
        };
        
        // Upload to S3 (parallel)
        await Promise.all([
          uploadToS3(CAMPAIGN_DATA_BUCKET, rawS3Key, rawData),
          uploadToS3(CAMPAIGN_DATA_BUCKET, extractedS3Key, extractedData),
        ]);
        
        // Update DynamoDB
        await updateBusinessWithScrapeData(
          business.place_id,
          rawS3Key,
          extractedS3Key,
          method,
          pages.length,
          pageBytes,
          durationMs,
          0,
          extracted
        );
        
        processed++;
        totalPages += pages.length;
        totalBytes += pageBytes;
        cloudscraperCount += siteCloudscraperCount;
        puppeteerCount += sitePuppeteerCount;
        
        console.log(`  ✓ Scraped ${pages.length} pages (cloudscraper: ${siteCloudscraperCount}, puppeteer: ${sitePuppeteerCount}), ${extracted.emails.length} emails, ${extracted.team_members.length} team members`);
        
      } catch (error) {
        failed++;
        console.error(`  ✗ Failed for ${business.business_name}:`, error);
      }
    }));
    
    console.log(`\nProgress: ${processed + failed}/${businesses.length}`);
  }
  
  // Clean up browser
  if (browser) {
    await browser.close();
  }
  
  console.log('\n=== Scrape Task Complete ===');
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total pages scraped: ${totalPages}`);
  console.log(`Cloudscraper: ${cloudscraperCount}, Puppeteer: ${puppeteerCount}`);
  console.log(`Total bytes: ${totalBytes}`);
  
  // Update job metrics
  if (jobId) {
    await updateJobMetrics(jobId, {
      processed,
      failed,
      filtered: 0, // Scrape task processes all businesses that pass filter rules
      cloudscraper_count: cloudscraperCount,
      puppeteer_count: puppeteerCount,
      total_pages: totalPages,
      total_bytes: totalBytes,
    });
  }
}

main().catch(error => {
  console.error('Task failed:', error);
  process.exit(1);
});
