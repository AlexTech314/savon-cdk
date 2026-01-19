import { PATTERNS } from '../config.js';
import { normalizeName, isValidPersonName } from '../utils/name.js';
import type { TeamMember, NewHireMention } from '../types.js';

/**
 * Extract team members from page text content
 */
export function extractTeamMembers(text: string, sourceUrl: string): TeamMember[] {
  const members: TeamMember[] = [];
  const seenNames = new Set<string>();
  
  // Pattern 1: Names with explicit titles (e.g., "John Smith, Owner")
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
    
    const normalizedName = name.toLowerCase();
    if (!seenNames.has(normalizedName)) {
      seenNames.add(normalizedName);
      members.push({ name, title, source_url: sourceUrl });
    }
  }
  
  // Pattern 2: Standalone names on team/about pages (no title required)
  // Only apply this on URLs that suggest it's a team/about page
  const urlLower = sourceUrl.toLowerCase();
  const isTeamPage = /\b(about|team|staff|people|leadership|our-team|meet|who-we-are|management)\b/.test(urlLower);
  
  if (isTeamPage) {
    // Look for standalone names - allow improperly capitalized names (will normalize later)
    // Pattern: Word Word at start of line or after > (HTML tag boundary)
    // Case-insensitive to catch "Joe kremer" style typos
    const standaloneNamePattern = /(?:^|\n|>)\s*([A-Za-z]{2,15}(?:\s+[A-Z]\.?)?\s+[A-Za-z]{2,20})\s*(?:\n|<|$)/gi;
    const standaloneMatches = [...text.matchAll(standaloneNamePattern)];
    
    for (const match of standaloneMatches) {
      const rawName = match[1]?.trim();
      if (!rawName) continue;
      
      // Must pass validation (checks first name against dictionary)
      if (!isValidPersonName(rawName)) {
        continue;
      }
      
      // Normalize to proper title case
      const name = normalizeName(rawName);
      
      const normalizedKey = name.toLowerCase();
      if (!seenNames.has(normalizedKey)) {
        seenNames.add(normalizedKey);
        // No explicit title, but we know they're on the team page
        members.push({ name, title: 'Team Member', source_url: sourceUrl });
      }
    }
  }
  
  const result = members.slice(0, 20); // Max 20 team members
  if (result.length > 0) {
    console.log(`    [Extract:Team] Found ${result.length} members: ${result.slice(0, 3).map(m => `${m.name} (${m.title})`).join(', ')}${result.length > 3 ? '...' : ''}`);
  }
  return result;
}

/**
 * Extract employee headcount from text
 */
export function extractHeadcount(text: string): { estimate: number | null; source: string | null } {
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

/**
 * Extract new hire mentions from text
 */
export function extractNewHires(text: string, sourceUrl: string): NewHireMention[] {
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

/**
 * Deduplicate team members by name
 */
export function dedupeTeamMembers(members: TeamMember[]): TeamMember[] {
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
