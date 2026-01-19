import { PATTERNS } from '../config.js';
import type { ExtractedData, ScrapedPage } from '../types.js';

/**
 * Extract social media profile links from HTML content
 */
export function extractSocialLinks(html: string): ExtractedData['social'] {
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

/**
 * Find the contact page URL from scraped pages
 */
export function findContactPageUrl(pages: ScrapedPage[]): string | null {
  for (const page of pages) {
    if (PATTERNS.contactPage.test(page.url)) {
      console.log(`    [Extract:ContactPage] Found: ${page.url}`);
      return page.url;
    }
  }
  return null;
}
