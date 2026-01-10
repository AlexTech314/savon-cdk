/**
 * Preview App API
 * Fetches business data from the backend and transforms it to PreviewData format
 */

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
// API Configuration
// ============================================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api-alpha.savondesigns.com';

// ============================================
// Backend Response Types
// ============================================

interface BackendBusiness {
  place_id: string;
  friendly_slug?: string;
  state: string;
  business_type: string;
  business_name: string;
  phone?: string;
  address: string;
  city: string;
  rating?: number;
  rating_count?: number;
  hours?: string;
  reviews?: string;
  photo_urls?: string;
  google_maps_uri?: string;
  editorial_summary?: string;
  street?: string;
  zip_code?: string;
  // Copy fields
  copy_hero_headline?: string;
  copy_hero_subheadline?: string;
  copy_hero_primary_cta?: string;
  copy_hero_secondary_cta?: string;
  copy_hero_trust_badges?: string;
  copy_services_tagline?: string;
  copy_services_headline?: string;
  copy_services_subheadline?: string;
  copy_services_items?: string;
  copy_why_tagline?: string;
  copy_why_headline?: string;
  copy_why_benefits?: string;
  copy_area_headline?: string;
  copy_area_hours_headline?: string;
  copy_area_hours_subtext?: string;
  copy_area_phone_headline?: string;
  copy_emergency_headline?: string;
  copy_emergency_subheadline?: string;
  copy_emergency_cta?: string;
  copy_contact_tagline?: string;
  copy_contact_trust_badges?: string;
  copy_contact_serving_note?: string;
  copy_seo_title?: string;
  copy_seo_description?: string;
  copy_seo_keywords?: string;
  copy_seo_schema_type?: string;
  copy_theme_primary?: string;
  copy_theme_primary_dark?: string;
  copy_theme_accent?: string;
  copy_theme_accent_hover?: string;
}

// ============================================
// Helper Functions
// ============================================

function parseHours(hoursString?: string): { day: string; time: string; isClosed: boolean }[] {
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

function parseReviews(reviewsString?: string): { text: string; rating: number; author: string; url?: string }[] {
  if (!reviewsString) return [];

  try {
    // Try parsing as JSON first (new format)
    const parsed = JSON.parse(reviewsString);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 3).map((r: { text?: string; authorDisplayName?: string; rating?: number; authorUri?: string }) => ({
        text: r.text || '',
        rating: r.rating || 5,
        author: r.authorDisplayName || 'Verified Customer',
        url: r.authorUri,
      }));
    }
  } catch {
    // Fall back to pipe-separated format
  }

  const reviews: { text: string; rating: number; author: string; url?: string }[] = [];
  const reviewParts = reviewsString.split(" | ");

  for (const part of reviewParts) {
    const ratingMatch = part.match(/\[(\d)★\]/);
    const rating = ratingMatch ? parseInt(ratingMatch[1]) : 5;

    const authorMatch = part.match(/— ([^(]+)\s*\(([^)]+)\)/);
    const author = authorMatch ? authorMatch[1].trim() : "Verified Customer";
    const url = authorMatch ? authorMatch[2].trim() : undefined;

    const textMatch = part.match(/"([^"]+)"/);
    let text = textMatch ? textMatch[1] : part;

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

function getFirstPhoto(photosString?: string): string {
  if (!photosString) return "/placeholder.svg";

  try {
    // Try parsing as JSON first
    const parsed = JSON.parse(photosString);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed[0];
    }
  } catch {
    // Fall back to pipe-separated format
  }

  const photos = photosString.split(" | ");
  return photos[0] || "/placeholder.svg";
}

function extractZipFromAddress(address: string, zip?: string): string {
  if (zip) return zip;
  const zipMatch = address.match(/\b(\d{5})\b/);
  return zipMatch ? zipMatch[1] : "";
}

function parseJsonArray<T>(jsonString: string | undefined, fallback: T[]): T[] {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString) as T[];
  } catch {
    return fallback;
  }
}

function parseTrustBadges(badgesString?: string): string[] {
  if (!badgesString) return [];
  return badgesString.split(" | ").map(b => b.trim()).filter(Boolean);
}

// ============================================
// Transform Backend Response to PreviewData
// ============================================

function transformToPreviewData(b: BackendBusiness): PreviewData {
  const hours = parseHours(b.hours);
  const hoursDisplay = formatHoursDisplay(hours);
  const reviews = parseReviews(b.reviews);
  const rating = b.rating || 5.0;
  const ratingCount = b.rating_count || 0;
  const zipCode = extractZipFromAddress(b.address, b.zip_code);
  const city = b.city || "Your City";
  const state = b.state || "";
  const phone = b.phone || "";

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

  const services = parseJsonArray(b.copy_services_items, defaultServices);
  const benefits = parseJsonArray(b.copy_why_benefits, defaultBenefits);
  const heroTrustBadges = parseTrustBadges(b.copy_hero_trust_badges);
  const contactTrustBadges = parseTrustBadges(b.copy_contact_trust_badges);

  return {
    id: b.place_id,
    businessName: b.business_name,
    businessType: b.business_type,
    phone,
    address: b.address,
    city,
    state,
    zipCode,
    rating,
    ratingCount,
    hoursDisplay,
    hours,
    heroImage: getFirstPhoto(b.photo_urls),
    seo: {
      title: b.copy_seo_title || `${b.business_name} | ${b.business_type} in ${city}`,
      description: b.copy_seo_description || `${b.business_name} is your trusted ${b.business_type.toLowerCase()} in ${city}. Call ${phone || "today"} for professional service!`,
      keywords: b.copy_seo_keywords || `${b.business_type.toLowerCase()}, ${city}, ${state}`,
      schemaType: b.copy_seo_schema_type || "LocalBusiness",
    },
    theme: {
      primary: b.copy_theme_primary || "220 60% 45%",
      primaryDark: b.copy_theme_primary_dark || "220 65% 32%",
      accent: b.copy_theme_accent || "30 90% 50%",
      accentHover: b.copy_theme_accent_hover || "30 90% 42%",
      background: "210 40% 98%",
      foreground: "222 47% 11%",
      graySection: "220 14% 96%",
      headingFont: "Inter",
      bodyFont: "Inter",
    },
    hero: {
      headline: b.copy_hero_headline || `Professional ${b.business_type} in ${city}`,
      subheadline: b.copy_hero_subheadline || "Quality Service You Can Trust",
      primaryCta: b.copy_hero_primary_cta || (phone ? `Call ${phone}` : "Contact Us"),
      secondaryCta: b.copy_hero_secondary_cta || "Learn More",
      trustBadges: heroTrustBadges.length > 0 ? heroTrustBadges : ["Licensed & Insured", "Quality Service", "Free Consultation"],
    },
    servicesSection: {
      tagline: b.copy_services_tagline || "OUR SERVICES",
      headline: b.copy_services_headline || "Our Expert Services",
      subheadline: b.copy_services_subheadline || `${b.business_name} delivers top-quality service throughout ${city}.`,
      services,
    },
    whyChooseUs: {
      tagline: b.copy_why_tagline || "WHY CHOOSE US",
      headline: b.copy_why_headline || `Your Trusted ${city} ${b.business_type}`,
      benefits,
    },
    serviceArea: {
      headline: b.copy_area_headline || `Serving ${city} & Surrounding Areas`,
      addressDisplay: b.street ? `${b.street}, ${city}${state ? `, ${state}` : ""}` : b.address,
      hoursHeadline: b.copy_area_hours_headline || hoursDisplay,
      hoursSubtext: b.copy_area_hours_subtext || (hours.some(h => h.time.toLowerCase().includes("24")) ? "Emergency services available around the clock" : "Call to schedule an appointment"),
      phoneHeadline: b.copy_area_phone_headline || (phone ? "Call Today" : "Contact Us"),
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
      headline: b.copy_emergency_headline || "Need Assistance?",
      subheadline: b.copy_emergency_subheadline || "Our team is ready to help. Contact us today to discuss your needs.",
      ctaText: b.copy_emergency_cta || (phone ? `Call ${phone} Now` : "Contact Us Now"),
    },
    contactSection: {
      tagline: b.copy_contact_tagline || "GET STARTED",
      headline: b.business_name,
      trustBadges: contactTrustBadges.length > 0 ? contactTrustBadges : [
        "Licensed & Insured",
        "Professional Team",
        "Quality Guaranteed",
        "Free Estimates",
        `Serving ${city}`,
      ],
      servingNote: b.copy_contact_serving_note || `Proudly serving ${city}${state ? `, ${state}` : ""} and surrounding areas with professional ${b.business_type.toLowerCase()} services.`,
    },
    footer: {
      copyright: `© ${new Date().getFullYear()} ${b.business_name}. All rights reserved.`,
      links: [
        { label: "Privacy Policy", href: "#" },
        { label: "Terms of Service", href: "#" },
      ],
    },
  };
}

// ============================================
// API Functions
// ============================================

/**
 * Fetch preview data by ID (place_id) or friendly_slug
 */
export async function fetchPreviewData(idOrSlug: string): Promise<PreviewData> {
  // Try fetching by slug first (more user-friendly URLs)
  let response = await fetch(`${API_BASE_URL}/businesses/slug/${encodeURIComponent(idOrSlug)}`);
  
  // If not found by slug, try by place_id
  if (!response.ok && response.status === 404) {
    response = await fetch(`${API_BASE_URL}/businesses/${encodeURIComponent(idOrSlug)}`);
  }
  
  if (!response.ok) {
    throw new Error(`Failed to fetch preview: ${response.statusText}`);
  }
  
  const business: BackendBusiness = await response.json();
  return transformToPreviewData(business);
}

/**
 * Get all available business IDs and slugs
 */
export async function getAvailableBusinessIds(): Promise<{ placeId: string; slug: string; name: string }[]> {
  const response = await fetch(`${API_BASE_URL}/businesses?limit=100`);
  
  if (!response.ok) {
    return [];
  }
  
  const data: { items: BackendBusiness[] } = await response.json();
  
  return data.items.map(b => ({
    placeId: b.place_id,
    slug: b.friendly_slug || '',
    name: b.business_name,
  }));
}

/**
 * Lookup preview ID by domain
 */
export async function fetchIdByDomain(domain: string): Promise<string | null> {
  // This would need a backend endpoint to map custom domains to business IDs
  // For now, return null to indicate domain lookup is not supported
  console.log('Domain lookup not yet implemented:', domain);
  return null;
}
