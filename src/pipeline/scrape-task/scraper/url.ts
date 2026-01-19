/**
 * Check if two URLs are on the same domain (ignoring www prefix)
 */
export function isSameDomain(url1: string, url2: string): boolean {
  try {
    const host1 = new URL(url1).hostname.replace(/^www\./, '');
    const host2 = new URL(url2).hostname.replace(/^www\./, '');
    return host1 === host2;
  } catch {
    return false;
  }
}

/**
 * Normalize a URL by removing hash, tracking params, etc.
 * Returns null if the URL is invalid
 */
export function normalizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    // Remove tracking params
    parsed.searchParams.delete('utm_source');
    parsed.searchParams.delete('utm_medium');
    parsed.searchParams.delete('utm_campaign');
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * URL patterns to skip when crawling
 */
export const SKIP_PATTERNS: RegExp[] = [
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

/**
 * Priority paths to visit first when crawling
 */
export const PRIORITY_PATHS = [
  '/about', '/about-us', '/about-us/', '/about/',
  '/contact', '/contact-us', '/contact-us/', '/contact/',
  '/team', '/our-team', '/staff', '/leadership', '/people',
  '/news', '/blog', '/press',
];

/**
 * Check if a URL should be skipped based on skip patterns
 */
export function shouldSkipUrl(url: string): boolean {
  return SKIP_PATTERNS.some(p => p.test(url));
}

/**
 * Sort URLs by priority (about, contact, team pages first)
 */
export function sortByPriority(urls: string[]): string[] {
  return [...urls].sort((a, b) => {
    try {
      const aPath = new URL(a).pathname.toLowerCase();
      const bPath = new URL(b).pathname.toLowerCase();
      const aScore = PRIORITY_PATHS.findIndex(p => aPath.includes(p));
      const bScore = PRIORITY_PATHS.findIndex(p => bPath.includes(p));
      
      if (aScore !== -1 && bScore === -1) return -1;
      if (bScore !== -1 && aScore === -1) return 1;
      if (aScore !== -1 && bScore !== -1) return aScore - bScore;
      return 0;
    } catch {
      return 0;
    }
  });
}
