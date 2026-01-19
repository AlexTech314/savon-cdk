import type { ScrapedPage, ExtractedData, TeamMember } from '../types.js';
import { extractEmails, extractPhones } from './contact.js';
import { extractSocialLinks, findContactPageUrl } from './social.js';
import { extractTeamMembers, extractHeadcount, extractNewHires, dedupeTeamMembers } from './team.js';
import { extractFoundedYear, extractHistorySnippets } from './history.js';
import { extractAcquisitionSignals } from './acquisition.js';
import { extractSchemaOrgData, SchemaOrgData } from '../scraper/html.js';

// Re-export all extractors
export { extractEmails, extractPhones } from './contact.js';
export { extractSocialLinks, findContactPageUrl } from './social.js';
export { extractTeamMembers, extractHeadcount, extractNewHires, dedupeTeamMembers } from './team.js';
export { extractFoundedYear, extractHistorySnippets } from './history.js';
export { extractAcquisitionSignals } from './acquisition.js';

/**
 * Extract social links from Schema.org sameAs URLs
 */
function extractSocialFromSchemaOrg(sameAs: string[]): ExtractedData['social'] {
  const social: ExtractedData['social'] = {};
  
  for (const url of sameAs) {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('linkedin.com') && !social.linkedin) {
      social.linkedin = url;
    } else if (urlLower.includes('facebook.com') && !social.facebook) {
      social.facebook = url;
    } else if (urlLower.includes('instagram.com') && !social.instagram) {
      social.instagram = url;
    } else if ((urlLower.includes('twitter.com') || urlLower.includes('x.com')) && !social.twitter) {
      social.twitter = url;
    }
  }
  
  return social;
}

/**
 * Extract all data from scraped pages
 */
export function extractAllData(pages: ScrapedPage[], knownPhones: string[] = []): ExtractedData {
  const allEmails = new Set<string>();
  const allPhones = new Set<string>();
  const allSocial: ExtractedData['social'] = {};
  const allTeamMembers: TeamMember[] = [];
  const allNewHires: ReturnType<typeof extractNewHires> = [];
  const allAcquisitionSignals: ReturnType<typeof extractAcquisitionSignals> = [];
  const allHistorySnippets: ReturnType<typeof extractHistorySnippets> = [];
  let foundedYear: number | null = null;
  let foundedSource: string | null = null;
  let headcountEstimate: number | null = null;
  let headcountSource: string | null = null;
  let schemaOrgData: SchemaOrgData | null = null;
  
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
    
    // Extract Schema.org JSON-LD (first valid schema wins)
    if (!schemaOrgData) {
      schemaOrgData = extractSchemaOrgData(html);
      
      // Use Schema.org data if available (high confidence)
      if (schemaOrgData) {
        // Email from Schema.org
        if (schemaOrgData.email) {
          allEmails.add(schemaOrgData.email);
        }
        
        // Phone from Schema.org (normalize it)
        if (schemaOrgData.telephone) {
          // Just add raw, phones are normalized in extractPhones
          const phone = schemaOrgData.telephone.replace(/[^\d]/g, '');
          if (phone.length === 10 || (phone.length === 11 && phone.startsWith('1'))) {
            allPhones.add(phone.slice(-10));
          }
        }
        
        // Founded year from Schema.org
        if (schemaOrgData.foundingYear && !foundedYear) {
          foundedYear = schemaOrgData.foundingYear;
          foundedSource = 'Schema.org JSON-LD';
        }
        
        // Headcount from Schema.org
        if (schemaOrgData.numberOfEmployees && !headcountEstimate) {
          headcountEstimate = schemaOrgData.numberOfEmployees;
          headcountSource = 'Schema.org JSON-LD';
        }
        
        // Social links from Schema.org sameAs
        if (schemaOrgData.sameAs && schemaOrgData.sameAs.length > 0) {
          const schemaSocial = extractSocialFromSchemaOrg(schemaOrgData.sameAs);
          if (schemaSocial.linkedin && !allSocial.linkedin) allSocial.linkedin = schemaSocial.linkedin;
          if (schemaSocial.facebook && !allSocial.facebook) allSocial.facebook = schemaSocial.facebook;
          if (schemaSocial.instagram && !allSocial.instagram) allSocial.instagram = schemaSocial.instagram;
          if (schemaSocial.twitter && !allSocial.twitter) allSocial.twitter = schemaSocial.twitter;
        }
        
        // Founder from Schema.org
        if (schemaOrgData.founder) {
          allTeamMembers.push({
            name: schemaOrgData.founder,
            title: 'Founder',
            source_url: page.url,
          });
        }
      }
    }
    
    // Extract emails (regex-based, supplements Schema.org)
    extractEmails(text).forEach(e => allEmails.add(e));
    
    // Extract phones (excluding known phones from Google)
    extractPhones(text, knownPhones).forEach(p => allPhones.add(p));
    
    // Extract social links (supplements Schema.org)
    const social = extractSocialLinks(html);
    if (social.linkedin && !allSocial.linkedin) allSocial.linkedin = social.linkedin;
    if (social.facebook && !allSocial.facebook) allSocial.facebook = social.facebook;
    if (social.instagram && !allSocial.instagram) allSocial.instagram = social.instagram;
    if (social.twitter && !allSocial.twitter) allSocial.twitter = social.twitter;
    
    // Extract founded year (first match wins, Schema.org takes priority)
    if (!foundedYear) {
      const { year, source } = extractFoundedYear(text);
      if (year) {
        foundedYear = year;
        foundedSource = source;
      }
    }
    
    // Extract headcount (first match wins, Schema.org takes priority)
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
  
  // Log extraction summary with actual values
  console.log(`  [Extraction Summary]`);
  if (schemaOrgData) {
    console.log(`    Schema.org: ✓ (${Object.keys(schemaOrgData).filter(k => (schemaOrgData as any)[k]).join(', ')})`);
  }
  console.log(`    Emails: ${[...allEmails].join(', ') || 'none'}`);
  console.log(`    Phones: ${[...allPhones].join(', ') || 'none'}`);
  
  const socialProfiles = Object.entries(allSocial)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  console.log(`    Social: ${socialProfiles || 'none'}`);
  
  if (dedupedTeamMembers.length > 0) {
    console.log(`    Team members (${dedupedTeamMembers.length}):`);
    dedupedTeamMembers.slice(0, 5).forEach(m => {
      console.log(`      - ${m.name} (${m.title})`);
    });
    if (dedupedTeamMembers.length > 5) {
      console.log(`      ... and ${dedupedTeamMembers.length - 5} more`);
    }
  } else {
    console.log(`    Team members: none`);
  }
  
  console.log(`    Headcount: ${headcountEstimate || 'unknown'}${headcountSource ? ` (from: "${headcountSource}")` : ''}`);
  console.log(`    Founded: ${foundedYear || 'unknown'}${foundedSource ? ` (from: "${foundedSource}")` : ''}`);
  console.log(`    Years in business: ${yearsInBusiness || 'unknown'}`);
  
  if (allAcquisitionSignals.length > 0) {
    console.log(`    Acquisition signals (${allAcquisitionSignals.length}):`);
    allAcquisitionSignals.slice(0, 3).forEach(s => {
      console.log(`      - ${s.signal_type}: "${s.text.slice(0, 60)}..."`);
    });
  }
  
  console.log(`    History snippets: ${allHistorySnippets.length}`);
  
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
