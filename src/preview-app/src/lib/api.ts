// Preview API types and data fetching
import businessesCsv from "../../../dummy-data/businesses_1767584099710.csv?raw";

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
    reviews: { text: string; rating: number; author: string }[];
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
}

function parseCSV(csvText: string): CsvRow[] {
  // Split CSV into logical lines (handling multi-line quoted fields)
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

// Split CSV text into logical lines, respecting quoted multi-line fields
function splitCsvIntoLogicalLines(csvText: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];

    if (char === '"') {
      // Check for escaped quote
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
      // Skip carriage returns
      continue;
    } else {
      current += char;
    }
  }

  // Don't forget the last line
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
// BUSINESS TYPE CONFIGURATIONS
// ============================================

interface BusinessTypeConfig {
  theme: PreviewData["theme"];
  schemaType: string;
  keywords: string[];
  services: { icon: string; title: string; description: string }[];
  benefits: { icon: string; title: string; description: string }[];
  trustBadges: string[];
  heroHeadline: (businessName: string, city: string) => string;
  heroSubheadline: string;
  primaryCta: (phone: string) => string;
  secondaryCta: string;
  emergencyHeadline: string;
  emergencySubheadline: string;
}

const businessTypeConfigs: Record<string, BusinessTypeConfig> = {
  plumber: {
    theme: {
      primary: "224 64% 33%",
      primaryDark: "224 71% 21%",
      accent: "25 95% 53%",
      accentHover: "25 95% 45%",
      background: "210 40% 98%",
      foreground: "222 47% 11%",
      graySection: "220 14% 96%",
      headingFont: "Inter",
      bodyFont: "Inter",
    },
    schemaType: "Plumber",
    keywords: ["plumber", "plumbing", "drain cleaning", "sewer repair", "water heater", "emergency plumber"],
    services: [
      { icon: "Wrench", title: "Emergency Plumbing Repairs", description: "24/7 availability for burst pipes, leaks, and all urgent plumbing issues. We respond fast when you need us most." },
      { icon: "Droplets", title: "Drain Cleaning & Unclogging", description: "Professional cleaning for kitchen sinks, bathroom drains, and main lines. Say goodbye to stubborn clogs." },
      { icon: "PipetteIcon", title: "Sewer Line Repair & Replacement", description: "Advanced trenchless technology and camera inspections for efficient sewer solutions with minimal disruption." },
      { icon: "Flame", title: "Water Heater Services", description: "Expert installation, repair, and maintenance for all types of water heaters. Never run out of hot water." },
      { icon: "Settings", title: "Pipe Installation & Repair", description: "New construction, repiping, and leak detection services. Quality materials and expert craftsmanship." },
      { icon: "Bath", title: "Bathroom & Kitchen Plumbing", description: "Complete fixture installation and renovations. Transform your spaces with professional plumbing work." },
    ],
    benefits: [
      { icon: "Clock", title: "24/7 Emergency Service", description: "Plumbing emergencies don't wait, and neither do we. Available around the clock, every day of the year." },
      { icon: "Shield", title: "Licensed & Insured", description: "Fully licensed, bonded, and insured for your complete peace of mind and protection." },
      { icon: "Zap", title: "Fast Response Time", description: "We pride ourselves on quick arrival times. Most calls answered within 60 minutes." },
      { icon: "Award", title: "Experienced Professionals", description: "Our team of certified master plumbers brings decades of combined experience." },
      { icon: "DollarSign", title: "Upfront Pricing", description: "No hidden fees or surprise charges. We provide clear quotes before any work begins." },
      { icon: "ThumbsUp", title: "Satisfaction Guaranteed", description: "We stand behind our work with a 100% satisfaction guarantee on all services." },
    ],
    trustBadges: ["Available 24/7", "Licensed & Insured", "Same-Day Service"],
    heroHeadline: (name, city) => `24/7 Emergency Plumbing Services in ${city}`,
    heroSubheadline: "Fast, Reliable Solutions for All Your Plumbing & Sewer Needs",
    primaryCta: (phone) => `Call Now ${phone}`,
    secondaryCta: "Get Free Quote",
    emergencyHeadline: "Plumbing Emergency?",
    emergencySubheadline: "Don't wait – our expert plumbers are standing by 24/7 to help you with any plumbing crisis.",
  },

  hvac: {
    theme: {
      primary: "210 65% 45%",
      primaryDark: "210 70% 30%",
      accent: "0 75% 55%",
      accentHover: "0 75% 45%",
      background: "210 40% 98%",
      foreground: "210 30% 15%",
      graySection: "210 15% 96%",
      headingFont: "Inter",
      bodyFont: "Inter",
    },
    schemaType: "HVACBusiness",
    keywords: ["HVAC", "air conditioning", "heating", "AC repair", "furnace repair", "hvac technician"],
    services: [
      { icon: "Thermometer", title: "AC Repair & Service", description: "Fast, reliable air conditioning repair. We diagnose and fix all makes and models to restore your comfort quickly." },
      { icon: "Flame", title: "Heating Repair & Installation", description: "Furnace repairs, heat pump service, and new heating system installations to keep you warm all winter." },
      { icon: "Wind", title: "System Installation", description: "Expert installation of new HVAC systems. We help you choose the right equipment for your home and budget." },
      { icon: "Settings", title: "Preventive Maintenance", description: "Regular tune-ups extend equipment life and prevent costly breakdowns. Join our maintenance plan and save." },
      { icon: "Home", title: "Indoor Air Quality", description: "Air purifiers, humidifiers, and duct cleaning to improve the air your family breathes." },
      { icon: "Zap", title: "Emergency Service", description: "HVAC emergency? We're available 24/7 for urgent repairs. No extra charge for nights or weekends." },
    ],
    benefits: [
      { icon: "Clock", title: "Same-Day Service", description: "We understand urgency. Most service calls completed the same day you call." },
      { icon: "Shield", title: "Licensed Technicians", description: "All technicians are NATE-certified, background-checked, and drug-tested for your peace of mind." },
      { icon: "DollarSign", title: "Upfront Pricing", description: "Know the cost before we start. No hidden fees, no surprises on your bill." },
      { icon: "Award", title: "Satisfaction Guarantee", description: "Not happy? We'll make it right. Your complete satisfaction is our top priority." },
      { icon: "CreditCard", title: "Flexible Financing", description: "New system? We offer 0% financing options to fit any budget. Easy approval." },
      { icon: "ThumbsUp", title: "5-Star Rated", description: "Hundreds of five-star reviews. See why homeowners choose us." },
    ],
    trustBadges: ["24/7 Emergency Service", "Licensed & Insured", "Financing Available"],
    heroHeadline: (name, city) => `Keep Your Home Comfortable Year-Round in ${city}`,
    heroSubheadline: "Expert HVAC Installation, Repair & Maintenance",
    primaryCta: (phone) => `Call Now ${phone}`,
    secondaryCta: "Schedule Service",
    emergencyHeadline: "AC or Heater Not Working?",
    emergencySubheadline: "Don't sweat it! Our technicians are standing by 24/7 to restore your comfort fast.",
  },

  accountant: {
    theme: {
      primary: "152 45% 28%",
      primaryDark: "152 50% 18%",
      accent: "45 93% 47%",
      accentHover: "45 93% 40%",
      background: "40 33% 98%",
      foreground: "152 30% 15%",
      graySection: "40 20% 96%",
      headingFont: "Inter",
      bodyFont: "Inter",
    },
    schemaType: "AccountingService",
    keywords: ["CPA", "accountant", "tax preparation", "bookkeeping", "financial planning", "tax services"],
    services: [
      { icon: "FileText", title: "Individual Tax Preparation", description: "Maximize your refund with expert personal tax preparation. We handle everything from simple returns to complex situations." },
      { icon: "Building", title: "Business Tax Services", description: "Strategic tax planning and preparation for businesses of all sizes. Minimize liability and stay compliant." },
      { icon: "Calculator", title: "Bookkeeping & Payroll", description: "Monthly bookkeeping, payroll processing, and financial reporting to keep your business running smoothly." },
      { icon: "TrendingUp", title: "Financial Planning", description: "Comprehensive financial planning and advisory services to help you achieve your long-term goals." },
      { icon: "Shield", title: "IRS Representation", description: "Expert representation for audits, appeals, and tax disputes. We protect your interests with the IRS." },
      { icon: "Briefcase", title: "Business Formation", description: "LLC, S-Corp, and business entity setup. Choose the right structure for tax efficiency and liability protection." },
    ],
    benefits: [
      { icon: "Award", title: "Licensed CPAs", description: "Our team of certified public accountants brings expertise and credentials you can trust." },
      { icon: "Clock", title: "Year-Round Support", description: "We're here for you beyond tax season. Get help whenever you need financial guidance." },
      { icon: "Users", title: "Personalized Service", description: "Every client receives individualized attention and strategies tailored to their unique situation." },
      { icon: "Lock", title: "Secure & Confidential", description: "Your financial data is protected with bank-level security and strict confidentiality protocols." },
      { icon: "DollarSign", title: "Transparent Pricing", description: "No surprises. Clear, upfront pricing for all services with no hidden fees." },
      { icon: "Zap", title: "Fast Turnaround", description: "Efficient processing without sacrificing accuracy. Get your returns filed quickly." },
    ],
    trustBadges: ["Licensed CPA", "20+ Years Experience", "Free Initial Consultation"],
    heroHeadline: (name, city) => `Expert Tax & Accounting Services in ${city}`,
    heroSubheadline: "Personalized Financial Solutions for Individuals and Businesses",
    primaryCta: () => "Schedule Consultation",
    secondaryCta: "View Services",
    emergencyHeadline: "Tax Season Approaching?",
    emergencySubheadline: "Don't wait until the last minute. Schedule your consultation today and get ahead of your tax obligations.",
  },

  electrician: {
    theme: {
      primary: "45 90% 45%",
      primaryDark: "45 95% 35%",
      accent: "220 70% 50%",
      accentHover: "220 70% 42%",
      background: "45 30% 98%",
      foreground: "45 30% 12%",
      graySection: "45 15% 96%",
      headingFont: "Inter",
      bodyFont: "Inter",
    },
    schemaType: "Electrician",
    keywords: ["electrician", "electrical repair", "wiring", "electrical installation", "panel upgrade", "lighting"],
    services: [
      { icon: "Zap", title: "Electrical Repairs", description: "Fast and reliable electrical repairs for outlets, switches, circuits, and more. Safety is our priority." },
      { icon: "Lightbulb", title: "Lighting Installation", description: "Interior and exterior lighting installation, including recessed lights, chandeliers, and landscape lighting." },
      { icon: "Settings", title: "Panel Upgrades", description: "Upgrade your electrical panel to meet modern demands. Increase capacity and improve safety." },
      { icon: "Home", title: "Whole-Home Rewiring", description: "Complete rewiring for older homes. Bring your electrical system up to code with modern wiring." },
      { icon: "Shield", title: "Safety Inspections", description: "Comprehensive electrical safety inspections. Identify potential hazards before they become problems." },
      { icon: "Battery", title: "Generator Installation", description: "Backup power solutions for your home. Never be left in the dark during outages." },
    ],
    benefits: [
      { icon: "Clock", title: "Same-Day Service", description: "Electrical issues can't wait. We offer same-day service for most repair calls." },
      { icon: "Shield", title: "Licensed & Insured", description: "Fully licensed master electricians with comprehensive insurance coverage." },
      { icon: "Award", title: "Code Compliant", description: "All work meets or exceeds local electrical codes for safety and compliance." },
      { icon: "DollarSign", title: "Upfront Pricing", description: "Know exactly what you'll pay before work begins. No hidden charges." },
      { icon: "ThumbsUp", title: "Satisfaction Guaranteed", description: "We stand behind every job with our satisfaction guarantee." },
      { icon: "Zap", title: "Fast Response", description: "Quick response times for emergencies. Your safety is our priority." },
    ],
    trustBadges: ["Licensed Master Electrician", "Same-Day Service", "Free Estimates"],
    heroHeadline: (name, city) => `Professional Electrical Services in ${city}`,
    heroSubheadline: "Safe, Reliable Electrical Solutions for Your Home or Business",
    primaryCta: (phone) => `Call Now ${phone}`,
    secondaryCta: "Get Free Quote",
    emergencyHeadline: "Electrical Emergency?",
    emergencySubheadline: "Don't risk it. Our licensed electricians are ready to help 24/7 for urgent electrical issues.",
  },

  default: {
    theme: {
      primary: "220 60% 45%",
      primaryDark: "220 65% 32%",
      accent: "30 90% 50%",
      accentHover: "30 90% 42%",
      background: "220 25% 98%",
      foreground: "220 30% 12%",
      graySection: "220 15% 96%",
      headingFont: "Inter",
      bodyFont: "Inter",
    },
    schemaType: "LocalBusiness",
    keywords: ["professional services", "local business", "quality service"],
    services: [
      { icon: "Star", title: "Quality Service", description: "We deliver exceptional service tailored to your specific needs with attention to detail." },
      { icon: "Users", title: "Personalized Approach", description: "Every client receives individualized attention and customized solutions." },
      { icon: "Award", title: "Expert Team", description: "Our experienced professionals bring years of expertise to every project." },
      { icon: "Clock", title: "Timely Delivery", description: "We respect your time and deliver on schedule without compromising quality." },
      { icon: "Shield", title: "Trusted & Reliable", description: "Count on us for consistent, dependable service every time." },
      { icon: "ThumbsUp", title: "Satisfaction Guaranteed", description: "Your satisfaction is our top priority. We stand behind our work." },
    ],
    benefits: [
      { icon: "Award", title: "Experienced Professionals", description: "Our team brings years of industry experience and expertise to every project." },
      { icon: "Clock", title: "Prompt Service", description: "We value your time and respond quickly to all inquiries and service requests." },
      { icon: "Shield", title: "Licensed & Insured", description: "Fully licensed and insured for your complete peace of mind." },
      { icon: "DollarSign", title: "Fair Pricing", description: "Transparent, competitive pricing with no hidden fees or surprises." },
      { icon: "Users", title: "Customer Focused", description: "We put our customers first and tailor our services to your unique needs." },
      { icon: "ThumbsUp", title: "Quality Guaranteed", description: "We stand behind our work with a satisfaction guarantee on all services." },
    ],
    trustBadges: ["Licensed & Insured", "Quality Service", "Free Consultation"],
    heroHeadline: (name, city) => `Professional ${name} in ${city}`,
    heroSubheadline: "Quality Service You Can Trust",
    primaryCta: (phone) => phone ? `Call ${phone}` : "Contact Us",
    secondaryCta: "Learn More",
    emergencyHeadline: "Need Assistance?",
    emergencySubheadline: "Our team is ready to help. Contact us today to discuss your needs.",
  },
};

function getBusinessTypeConfig(businessType: string): BusinessTypeConfig {
  const normalizedType = businessType.toLowerCase();

  if (normalizedType.includes("plumb") || normalizedType.includes("sewer") || normalizedType.includes("drain")) {
    return businessTypeConfigs.plumber;
  }
  if (normalizedType.includes("hvac") || normalizedType.includes("heating") || normalizedType.includes("cooling") || normalizedType.includes("air condition")) {
    return businessTypeConfigs.hvac;
  }
  if (normalizedType.includes("account") || normalizedType.includes("cpa") || normalizedType.includes("tax") || normalizedType.includes("bookkeep") || normalizedType.includes("financial")) {
    return businessTypeConfigs.accountant;
  }
  if (normalizedType.includes("electric")) {
    return businessTypeConfigs.electrician;
  }

  return businessTypeConfigs.default;
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

function parseReviews(reviewsString: string): { text: string; rating: number; author: string }[] {
  if (!reviewsString) return [];

  const reviews: { text: string; rating: number; author: string }[] = [];
  const reviewParts = reviewsString.split(" | ");

  for (const part of reviewParts) {
    // Extract rating from [5★] pattern
    const ratingMatch = part.match(/\[(\d)★\]/);
    const rating = ratingMatch ? parseInt(ratingMatch[1]) : 5;

    // Extract author from — Author Name pattern
    const authorMatch = part.match(/— ([^(]+)/);
    const author = authorMatch ? authorMatch[1].trim() : "Verified Customer";

    // Extract text (everything in quotes)
    const textMatch = part.match(/"([^"]+)"/);
    let text = textMatch ? textMatch[1] : part;

    // Clean up text
    text = text.substring(0, 300);
    if (text.length === 300) {
      text = text.substring(0, text.lastIndexOf(" ")) + "...";
    }

    if (text.length > 20) {
      reviews.push({ text, rating, author });
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

function transformRowToPreviewData(row: CsvRow): PreviewData {
  const config = getBusinessTypeConfig(row.business_type);
  const hours = parseHours(row.hours);
  const hoursDisplay = formatHoursDisplay(hours);
  const reviews = parseReviews(row.reviews);
  const rating = parseFloat(row.rating) || 5.0;
  const ratingCount = parseInt(row.rating_count) || 0;
  const zipCode = extractZipFromAddress(row.address, row.zip);
  const city = row.city || "Your City";
  const state = row.state || "";
  const phone = row.phone || "";

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
      title: `${row.business_name} | ${row.business_type} in ${city}`,
      description: `${row.business_name} is your trusted ${row.business_type.toLowerCase()} in ${city}. ${config.keywords.slice(0, 3).join(", ")}. Call ${phone || "today"} for professional service!`,
      keywords: [...config.keywords, city, state].filter(Boolean).join(", "),
      schemaType: config.schemaType,
    },
    theme: config.theme,
    hero: {
      headline: config.heroHeadline(row.business_name, city),
      subheadline: config.heroSubheadline,
      primaryCta: config.primaryCta(phone),
      secondaryCta: config.secondaryCta,
      trustBadges: config.trustBadges,
    },
    servicesSection: {
      tagline: "WHAT WE OFFER",
      headline: "Our Expert Services",
      subheadline: `From routine maintenance to complex solutions, ${row.business_name} delivers top-quality service throughout ${city}.`,
      services: config.services,
    },
    whyChooseUs: {
      tagline: "WHY CHOOSE US",
      headline: `Your Trusted ${city} ${row.business_type}`,
      benefits: config.benefits,
    },
    serviceArea: {
      headline: `Serving ${city} & Surrounding Areas`,
      addressDisplay: row.street ? `${row.street}, ${city}${state ? `, ${state}` : ""}` : row.address,
      hoursHeadline: hoursDisplay,
      hoursSubtext: hours.some(h => h.time.toLowerCase().includes("24")) ? "Emergency services available around the clock" : "Call to schedule an appointment",
      phoneHeadline: phone ? "Call Us Today" : "Contact Us",
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
      headline: config.emergencyHeadline,
      subheadline: config.emergencySubheadline,
      ctaText: phone ? `Call ${phone} Now` : "Contact Us Now",
    },
    contactSection: {
      tagline: "CONTACT US",
      headline: row.business_name,
      trustBadges: [
        "Licensed & Insured",
        "Professional Team",
        "Quality Guaranteed",
        "Free Estimates",
        `Serving ${city}`,
      ],
      servingNote: `Proudly serving ${city}${state ? `, ${state}` : ""} and surrounding areas with professional ${row.business_type.toLowerCase()} services.`,
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

  const rows = parseCSV(businessesCsv);
  const dataById = new Map<string, PreviewData>();
  const slugToId = new Map<string, string>();

  for (const row of rows) {
    if (!row.place_id || !row.business_name) continue;

    const previewData = transformRowToPreviewData(row);
    dataById.set(row.place_id, previewData);

    if (row.friendly_slug) {
      slugToId.set(row.friendly_slug, row.place_id);
    }
  }

  cachedData = dataById;
  cachedSlugIndex = slugToId;

  return { dataById, slugToId };
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Fetch preview data by ID (place_id) or friendly_slug
 * 
 * In development: uses CSV data
 * In production: calls real API endpoint if configured
 */
export async function fetchPreviewData(idOrSlug: string): Promise<PreviewData> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const useMockData = import.meta.env.DEV || !apiBaseUrl;

  // Use CSV data in development or if no API URL is configured
  if (useMockData) {
    await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate network

    const { dataById, slugToId } = loadData();

    // Try to find by place_id first
    let data = dataById.get(idOrSlug);

    // If not found, try by friendly_slug
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

  // Production: call real API
  const response = await fetch(`${apiBaseUrl}/api/preview/${idOrSlug}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch preview: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get all available business IDs and slugs (for development/testing)
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
 * Used when the app is deployed to a custom domain
 */
export async function fetchIdByDomain(domain: string): Promise<string | null> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

  // In dev mode, skip domain lookup
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
