import { PATTERNS } from '../config.js';
import type { HistorySnippet } from '../types.js';

/**
 * Extract the year a business was founded from text
 */
export function extractFoundedYear(text: string): { year: number | null; source: string | null } {
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

/**
 * Extract history-related snippets from text
 */
export function extractHistorySnippets(text: string, sourceUrl: string): HistorySnippet[] {
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
