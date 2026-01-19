/**
 * Extract text content from HTML, stripping tags, scripts, and styles
 */
export function extractTextContent(html: string): string {
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

/**
 * Extract the page title from HTML
 */
export function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1]?.trim() || '';
}

/**
 * Extract all links from HTML and resolve them to absolute URLs
 */
export function extractLinks(html: string, baseUrl: string): string[] {
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

/**
 * Check if HTML needs Puppeteer for JavaScript rendering
 * Returns true if the page appears to be a JavaScript SPA with minimal content
 */
export function needsPuppeteer(html: string): boolean {
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

// ============ Schema.org JSON-LD Extraction ============

/**
 * Structured data extracted from Schema.org JSON-LD
 */
export interface SchemaOrgData {
  email?: string;
  telephone?: string;
  foundingDate?: string;
  foundingYear?: number;
  name?: string;
  description?: string;
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
  };
  sameAs?: string[];  // Social media URLs
  numberOfEmployees?: number;
  founder?: string;
}

/**
 * Types we're interested in extracting from JSON-LD
 */
const SCHEMA_TYPES_OF_INTEREST = [
  'LocalBusiness',
  'Organization',
  'Corporation',
  'HomeAndConstructionBusiness',
  'ProfessionalService',
  'FinancialService',
  'InsuranceAgency',
  'RealEstateAgent',
  'LegalService',
  'Dentist',
  'Physician',
  'Store',
  'Restaurant',
  'AutoRepair',
  'Plumber',
  'Electrician',
  'HVACBusiness',
  'RoofingContractor',
  'GeneralContractor',
];

/**
 * Extract Schema.org JSON-LD structured data from HTML
 * Returns structured data that can be used to supplement regex extraction
 */
export function extractSchemaOrgData(html: string): SchemaOrgData | null {
  // Find all JSON-LD script tags
  const scriptPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const matches = [...html.matchAll(scriptPattern)];
  
  if (matches.length === 0) {
    return null;
  }
  
  for (const match of matches) {
    try {
      const jsonContent = match[1].trim();
      const data = JSON.parse(jsonContent);
      
      // Handle @graph arrays
      const items = Array.isArray(data['@graph']) ? data['@graph'] : [data];
      
      for (const item of items) {
        const itemType = item['@type'];
        
        // Check if this is a type we're interested in
        const types = Array.isArray(itemType) ? itemType : [itemType];
        const isRelevant = types.some(t => SCHEMA_TYPES_OF_INTEREST.includes(t));
        
        if (!isRelevant) continue;
        
        const result: SchemaOrgData = {};
        
        // Extract email
        if (item.email) {
          result.email = String(item.email).replace(/^mailto:/i, '');
        }
        
        // Extract phone
        if (item.telephone) {
          result.telephone = String(item.telephone);
        }
        
        // Extract founding date
        if (item.foundingDate) {
          result.foundingDate = String(item.foundingDate);
          const year = parseInt(item.foundingDate.slice(0, 4), 10);
          if (year >= 1800 && year <= new Date().getFullYear()) {
            result.foundingYear = year;
          }
        }
        
        // Extract name
        if (item.name) {
          result.name = String(item.name);
        }
        
        // Extract description
        if (item.description) {
          result.description = String(item.description);
        }
        
        // Extract address
        if (item.address && typeof item.address === 'object') {
          result.address = {
            streetAddress: item.address.streetAddress,
            addressLocality: item.address.addressLocality,
            addressRegion: item.address.addressRegion,
            postalCode: item.address.postalCode,
          };
        }
        
        // Extract social links (sameAs)
        if (item.sameAs) {
          const sameAs = Array.isArray(item.sameAs) ? item.sameAs : [item.sameAs];
          result.sameAs = sameAs.filter((url: unknown): url is string => 
            typeof url === 'string' && url.startsWith('http')
          );
        }
        
        // Extract employee count
        if (item.numberOfEmployees) {
          if (typeof item.numberOfEmployees === 'number') {
            result.numberOfEmployees = item.numberOfEmployees;
          } else if (typeof item.numberOfEmployees === 'object') {
            // Handle QuantitativeValue format
            const value = item.numberOfEmployees.value || item.numberOfEmployees.minValue;
            if (typeof value === 'number') {
              result.numberOfEmployees = value;
            }
          }
        }
        
        // Extract founder
        if (item.founder) {
          if (typeof item.founder === 'string') {
            result.founder = item.founder;
          } else if (typeof item.founder === 'object' && item.founder.name) {
            result.founder = item.founder.name;
          }
        }
        
        // Return first relevant schema found
        if (Object.keys(result).length > 0) {
          console.log(`    [Schema.org] Found ${types.join('/')} with: ${Object.keys(result).join(', ')}`);
          return result;
        }
      }
    } catch (e) {
      // Invalid JSON or parsing error, continue to next script tag
    }
  }
  
  return null;
}
