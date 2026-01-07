// Preview API types and data fetching
// CSV import removed - will use API in production

export interface PreviewData {
  id: string;
  businessName: string;
  businessType: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  rating: number;
  ratingCount: number;
  hoursDisplay: string;
  hours: { day: string; time: string; isClosed: boolean }[];
  heroImage: string;
  seo: {
    title: string;
    description: string;
    keywords: string;
    canonicalUrl?: string;
    schemaType: string;
  };
  theme: {
    primary: string;
    primaryDark: string;
    accent: string;
    accentHover: string;
    background: string;
    foreground: string;
    graySection: string;
    headingFont: string;
    bodyFont: string;
  };
  hero: {
    headline: string;
    subheadline: string;
    primaryCta: string;
    secondaryCta: string;
    trustBadges: string[];
  };
  servicesSection: {
    tagline: string;
    headline: string;
    subheadline: string;
    services: { icon: string; title: string; description: string }[];
  };
  whyChooseUs: {
    tagline: string;
    headline: string;
    benefits: { icon: string; title: string; description: string }[];
  };
  serviceArea: {
    headline: string;
    addressDisplay: string;
    hoursHeadline: string;
    hoursSubtext: string;
    phoneHeadline: string;
  };
  reviewsSection: {
    tagline: string;
    headline: string;
    subheadline: string;
    reviews: { text: string; rating: number; author: string; url?: string }[];
  };
  emergencyCta: {
    headline: string;
    subheadline: string;
    ctaText: string;
  };
  contactSection: {
    tagline: string;
    headline: string;
    trustBadges: string[];
    servingNote: string;
  };
  footer: {
    copyright: string;
    links?: { label: string; href: string }[];
  };
}

// ============================================
// CSV PARSING
// ============================================

interface CsvRow {
  // Core business info
  place_id: string;
  friendly_slug: string;
  state: string;
  business_type: string;
  business_name: string;
  phone: string;
  address: string;
  city: string;
  rating: string;
  rating_count: string;
  hours: string;
  reviews: string;
  photos: string;
  google_maps_uri: string;
  editorial_summary: string;
  website: string;
  price_level: string;
  business_status: string;
  types: string;
  latitude: string;
  longitude: string;
  street: string;
  zip: string;
  country: string;
  international_phone: string;
  primary_type: string;
  // Pre-generated copy
  copy_hero_headline: string;
  copy_hero_subheadline: string;
  copy_hero_primary_cta: string;
  copy_hero_secondary_cta: string;
  copy_hero_trust_badges: string;
  copy_services_tagline: string;
  copy_services_headline: string;
  copy_services_subheadline: string;
  copy_services_items: string;
  copy_why_tagline: string;
  copy_why_headline: string;
  copy_why_benefits: string;
  copy_area_headline: string;
  copy_area_hours_headline: string;
  copy_area_hours_subtext: string;
  copy_area_phone_headline: string;
  copy_emergency_headline: string;
  copy_emergency_subheadline: string;
  copy_emergency_cta: string;
  copy_contact_tagline: string;
  copy_contact_trust_badges: string;
  copy_contact_serving_note: string;
  copy_seo_title: string;
  copy_seo_description: string;
  copy_seo_keywords: string;
  copy_seo_schema_type: string;
  copy_theme_primary: string;
  copy_theme_primary_dark: string;
  copy_theme_accent: string;
  copy_theme_accent_hover: string;
}

function parseCSV(csvText: string): CsvRow[] {
  const logicalLines = splitCsvIntoLogicalLines(csvText);
  if (logicalLines.length < 2) return [];

  const headerLine = logicalLines[0];
  const headers = parseCSVLine(headerLine);

  const rows: CsvRow[] = [];

  for (let i = 1; i < logicalLines.length; i++) {
    const line = logicalLines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    if (values.length !== headers.length) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    rows.push(row as unknown as CsvRow);
  }

  return rows;
}

function splitCsvIntoLogicalLines(csvText: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];

    if (char === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        current += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += char;
      }
    } else if (char === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
    } else if (char === "\r") {
      continue;
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    lines.push(current);
  }

  return lines;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

// ============================================
// DATA TRANSFORMATION
// ============================================

function parseHours(hoursString: string): { day: string; time: string; isClosed: boolean }[] {
  if (!hoursString) {
    return [
      { day: "Monday", time: "9:00 AM - 5:00 PM", isClosed: false },
      { day: "Tuesday", time: "9:00 AM - 5:00 PM", isClosed: false },
      { day: "Wednesday", time: "9:00 AM - 5:00 PM", isClosed: false },
      { day: "Thursday", time: "9:00 AM - 5:00 PM", isClosed: false },
      { day: "Friday", time: "9:00 AM - 5:00 PM", isClosed: false },
      { day: "Saturday", time: "Closed", isClosed: true },
      { day: "Sunday", time: "Closed", isClosed: true },
    ];
  }

  const dayParts = hoursString.split("; ");
  const hours: { day: string; time: string; isClosed: boolean }[] = [];

  for (const part of dayParts) {
    const colonIndex = part.indexOf(": ");
    if (colonIndex === -1) continue;

    const day = part.substring(0, colonIndex);
    const time = part.substring(colonIndex + 2);
    const isClosed = time.toLowerCase() === "closed";

    hours.push({ day, time, isClosed });
  }

  return hours.length > 0 ? hours : [
    { day: "Monday", time: "9:00 AM - 5:00 PM", isClosed: false },
    { day: "Tuesday", time: "9:00 AM - 5:00 PM", isClosed: false },
    { day: "Wednesday", time: "9:00 AM - 5:00 PM", isClosed: false },
    { day: "Thursday", time: "9:00 AM - 5:00 PM", isClosed: false },
    { day: "Friday", time: "9:00 AM - 5:00 PM", isClosed: false },
    { day: "Saturday", time: "Closed", isClosed: true },
    { day: "Sunday", time: "Closed", isClosed: true },
  ];
}

function formatHoursDisplay(hours: { day: string; time: string; isClosed: boolean }[]): string {
  const openDays = hours.filter(h => !h.isClosed);
  if (openDays.length === 0) return "Hours vary";

  const isAlwaysOpen = openDays.every(h => h.time.toLowerCase().includes("24 hour"));
  if (isAlwaysOpen && openDays.length === 7) {
    return "Open 24 Hours - 7 Days a Week";
  }

  const weekdayHours = hours.slice(0, 5);
  const sameWeekdayHours = weekdayHours.every(h => h.time === weekdayHours[0].time);

  if (sameWeekdayHours && !weekdayHours[0].isClosed) {
    return `Mon-Fri ${weekdayHours[0].time}`;
  }

  return openDays.length === 7 ? "Open 7 Days a Week" : `${openDays.length} Days a Week`;
}

function parseReviews(reviewsString: string): { text: string; rating: number; author: string; url?: string }[] {
  if (!reviewsString) return [];

  const reviews: { text: string; rating: number; author: string; url?: string }[] = [];
  const reviewParts = reviewsString.split(" | ");

  for (const part of reviewParts) {
    // Extract rating from [5★] pattern
    const ratingMatch = part.match(/\[(\d)★\]/);
    const rating = ratingMatch ? parseInt(ratingMatch[1]) : 5;

    // Extract author and URL from — Author Name (URL) pattern
    const authorMatch = part.match(/— ([^(]+)\s*\(([^)]+)\)/);
    const author = authorMatch ? authorMatch[1].trim() : "Verified Customer";
    const url = authorMatch ? authorMatch[2].trim() : undefined;

    // Extract text (everything in quotes)
    const textMatch = part.match(/"([^"]+)"/);
    let text = textMatch ? textMatch[1] : part;

    // Clean up text - truncate if too long
    text = text.substring(0, 300);
    if (text.length === 300) {
      text = text.substring(0, text.lastIndexOf(" ")) + "...";
    }

    if (text.length > 20) {
      reviews.push({ text, rating, author, url });
    }
  }

  return reviews.slice(0, 3);
}

function getFirstPhoto(photosString: string): string {
  if (!photosString) return "/placeholder.svg";

  const photos = photosString.split(" | ");
  return photos[0] || "/placeholder.svg";
}

function extractZipFromAddress(address: string, zip: string): string {
  if (zip) return zip;

  const zipMatch = address.match(/\b(\d{5})\b/);
  return zipMatch ? zipMatch[1] : "";
}

function parseJsonArray<T>(jsonString: string, fallback: T[]): T[] {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString) as T[];
  } catch {
    return fallback;
  }
}

function parseTrustBadges(badgesString: string): string[] {
  if (!badgesString) return [];
  // Trust badges are pipe-separated in the CSV
  return badgesString.split(" | ").map(b => b.trim()).filter(Boolean);
}

function transformRowToPreviewData(row: CsvRow): PreviewData {
  const hours = parseHours(row.hours);
  const hoursDisplay = formatHoursDisplay(hours);
  const reviews = parseReviews(row.reviews);
  const rating = parseFloat(row.rating) || 5.0;
  const ratingCount = parseInt(row.rating_count) || 0;
  const zipCode = extractZipFromAddress(row.address, row.zip);
  const city = row.city || "Your City";
  const state = row.state || "";
  const phone = row.phone || "";

  // Parse services and benefits from JSON in CSV
  const defaultServices = [
    { icon: "Star", title: "Quality Service", description: "We deliver exceptional service tailored to your specific needs." },
    { icon: "Users", title: "Expert Team", description: "Our experienced professionals bring expertise to every project." },
    { icon: "Clock", title: "Timely Delivery", description: "We respect your time and deliver on schedule." },
  ];

  const defaultBenefits = [
    { icon: "Award", title: "Experienced Professionals", description: "Years of industry experience and expertise." },
    { icon: "Shield", title: "Licensed & Insured", description: "Fully licensed and insured for your peace of mind." },
    { icon: "ThumbsUp", title: "Quality Guaranteed", description: "We stand behind our work with a satisfaction guarantee." },
  ];

  const services = parseJsonArray(row.copy_services_items, defaultServices);
  const benefits = parseJsonArray(row.copy_why_benefits, defaultBenefits);
  const heroTrustBadges = parseTrustBadges(row.copy_hero_trust_badges);
  const contactTrustBadges = parseTrustBadges(row.copy_contact_trust_badges);

  return {
    id: row.place_id,
    businessName: row.business_name,
    businessType: row.business_type,
    phone,
    address: row.address,
    city,
    state,
    zipCode,
    rating,
    ratingCount,
    hoursDisplay,
    hours,
    heroImage: getFirstPhoto(row.photos),
    seo: {
      title: row.copy_seo_title || `${row.business_name} | ${row.business_type} in ${city}`,
      description: row.copy_seo_description || `${row.business_name} is your trusted ${row.business_type.toLowerCase()} in ${city}. Call ${phone || "today"} for professional service!`,
      keywords: row.copy_seo_keywords || `${row.business_type.toLowerCase()}, ${city}, ${state}`,
      schemaType: row.copy_seo_schema_type || "LocalBusiness",
    },
    theme: {
      primary: row.copy_theme_primary || "220 60% 45%",
      primaryDark: row.copy_theme_primary_dark || "220 65% 32%",
      accent: row.copy_theme_accent || "30 90% 50%",
      accentHover: row.copy_theme_accent_hover || "30 90% 42%",
      background: "210 40% 98%",
      foreground: "222 47% 11%",
      graySection: "220 14% 96%",
      headingFont: "Inter",
      bodyFont: "Inter",
    },
    hero: {
      headline: row.copy_hero_headline || `Professional ${row.business_type} in ${city}`,
      subheadline: row.copy_hero_subheadline || "Quality Service You Can Trust",
      primaryCta: row.copy_hero_primary_cta || (phone ? `Call ${phone}` : "Contact Us"),
      secondaryCta: row.copy_hero_secondary_cta || "Learn More",
      trustBadges: heroTrustBadges.length > 0 ? heroTrustBadges : ["Licensed & Insured", "Quality Service", "Free Consultation"],
    },
    servicesSection: {
      tagline: row.copy_services_tagline || "OUR SERVICES",
      headline: row.copy_services_headline || "Our Expert Services",
      subheadline: row.copy_services_subheadline || `${row.business_name} delivers top-quality service throughout ${city}.`,
      services,
    },
    whyChooseUs: {
      tagline: row.copy_why_tagline || "WHY CHOOSE US",
      headline: row.copy_why_headline || `Your Trusted ${city} ${row.business_type}`,
      benefits,
    },
    serviceArea: {
      headline: row.copy_area_headline || `Serving ${city} & Surrounding Areas`,
      addressDisplay: row.street ? `${row.street}, ${city}${state ? `, ${state}` : ""}` : row.address,
      hoursHeadline: row.copy_area_hours_headline || hoursDisplay,
      hoursSubtext: row.copy_area_hours_subtext || (hours.some(h => h.time.toLowerCase().includes("24")) ? "Emergency services available around the clock" : "Call to schedule an appointment"),
      phoneHeadline: row.copy_area_phone_headline || (phone ? "Call Today" : "Contact Us"),
    },
    reviewsSection: {
      tagline: "TESTIMONIALS",
      headline: "What Our Customers Say",
      subheadline: ratingCount > 0 ? `Based on ${ratingCount}+ Google Reviews` : "Customer Reviews",
      reviews: reviews.length > 0 ? reviews : [
        { text: "Excellent service! Professional, timely, and affordable. Highly recommend!", rating: 5, author: "Verified Customer" },
        { text: "Great experience from start to finish. Will definitely use again.", rating: 5, author: "Verified Customer" },
        { text: "Outstanding work and customer service. Very impressed!", rating: 5, author: "Verified Customer" },
      ],
    },
    emergencyCta: {
      headline: row.copy_emergency_headline || "Need Assistance?",
      subheadline: row.copy_emergency_subheadline || "Our team is ready to help. Contact us today to discuss your needs.",
      ctaText: row.copy_emergency_cta || (phone ? `Call ${phone} Now` : "Contact Us Now"),
    },
    contactSection: {
      tagline: row.copy_contact_tagline || "GET STARTED",
      headline: row.business_name,
      trustBadges: contactTrustBadges.length > 0 ? contactTrustBadges : [
        "Licensed & Insured",
        "Professional Team",
        "Quality Guaranteed",
        "Free Estimates",
        `Serving ${city}`,
      ],
      servingNote: row.copy_contact_serving_note || `Proudly serving ${city}${state ? `, ${state}` : ""} and surrounding areas with professional ${row.business_type.toLowerCase()} services.`,
    },
    footer: {
      copyright: `© ${new Date().getFullYear()} ${row.business_name}. All rights reserved.`,
      links: [
        { label: "Privacy Policy", href: "#" },
        { label: "Terms of Service", href: "#" },
      ],
    },
  };
}

// ============================================
// DATA LOADING & CACHING
// ============================================

let cachedData: Map<string, PreviewData> | null = null;
let cachedSlugIndex: Map<string, string> | null = null;

function loadData(): { dataById: Map<string, PreviewData>; slugToId: Map<string, string> } {
  if (cachedData && cachedSlugIndex) {
    return { dataById: cachedData, slugToId: cachedSlugIndex };
  }

  // CSV data removed - return empty maps
  // In production, data will come from the API
  const dataById = new Map<string, PreviewData>();
  const slugToId = new Map<string, string>();

  cachedData = dataById;
  cachedSlugIndex = slugToId;

  return { dataById, slugToId };
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Fetch preview data by ID (place_id) or friendly_slug
 */
export async function fetchPreviewData(idOrSlug: string): Promise<PreviewData> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const useMockData = import.meta.env.DEV || !apiBaseUrl;

  if (useMockData) {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const { dataById, slugToId } = loadData();

    let data = dataById.get(idOrSlug);

    if (!data) {
      const placeId = slugToId.get(idOrSlug);
      if (placeId) {
        data = dataById.get(placeId);
      }
    }

    if (!data) {
      throw new Error(`Preview not found for id: ${idOrSlug}`);
    }

    return data;
  }

  const response = await fetch(`${apiBaseUrl}/api/preview/${idOrSlug}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch preview: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get all available business IDs and slugs
 */
export function getAvailableBusinessIds(): { placeId: string; slug: string; name: string }[] {
  const { dataById, slugToId } = loadData();

  const reverseSlugIndex = new Map<string, string>();
  for (const [slug, placeId] of slugToId.entries()) {
    reverseSlugIndex.set(placeId, slug);
  }

  return Array.from(dataById.entries()).map(([placeId, data]) => ({
    placeId,
    slug: reverseSlugIndex.get(placeId) || "",
    name: data.businessName,
  }));
}

/**
 * Lookup preview ID by domain
 */
export async function fetchIdByDomain(domain: string): Promise<string | null> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

  if (import.meta.env.DEV) {
    return null;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/domain-lookup?domain=${domain}`);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.id;
  } catch {
    return null;
  }
}
