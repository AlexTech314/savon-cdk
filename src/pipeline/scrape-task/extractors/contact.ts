import { PATTERNS } from '../config.js';
import { normalizePhone, isFakePhone } from '../utils/phone.js';

/**
 * Extract email addresses from text content
 */
export function extractEmails(text: string, sourceUrl?: string): string[] {
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
 * Extract phone numbers from text, excluding known phones and fake numbers
 */
export function extractPhones(text: string, knownPhones: string[] = []): string[] {
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
