import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import Anthropic from '@anthropic-ai/sdk';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY!;
const BUSINESSES_TABLE_NAME = process.env.BUSINESSES_TABLE_NAME!;

const anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY });

interface Business {
  place_id: string;
  business_name: string;
  business_type: string;
  city: string;
  state: string;
  phone: string;
  address: string;
  rating: number | null;
  rating_count: number | null;
  hours: string;
  reviews: string;
  google_maps_uri: string;
  copy_generated?: boolean;
}

interface LandingPageCopy {
  hero: {
    headline: string;
    subheadline: string;
    primaryCtaText: string;
    secondaryCtaText: string;
    trustBadges: string[];
  };
  servicesSection: {
    tagline: string;
    headline: string;
    subheadline: string;
    services: Array<{ icon: string; title: string; description: string }>;
  };
  whyChooseUs: {
    tagline: string;
    headline: string;
    benefits: Array<{ icon: string; title: string; description: string }>;
  };
  serviceArea: {
    headline: string;
    hoursHeadline: string;
    hoursSubtext: string;
    phoneHeadline: string;
  };
  emergencyCta: {
    headline: string;
    subheadline: string;
    ctaText: string;
  };
  contactSection: {
    tagline: string;
    trustBadges: string[];
    servingNote: string;
  };
  seo: {
    title: string;
    description: string;
    keywords: string;
    schemaType: string;
  };
  theme: {
    primary: string;
    primaryDark: string;
    accent: string;
    accentHover: string;
  };
}

const SYSTEM_PROMPT = `You are an expert copywriter specializing in local service business marketing. Your task is to generate compelling, SEO-optimized copy for a landing page that converts visitors into customers.

The Goal: Create copy that:
1. Builds immediate trust and credibility
2. Clearly communicates the value proposition
3. Drives phone calls and inquiries
4. Ranks well for local SEO
5. Feels professional yet approachable

Output ONLY a valid JSON object with the exact structure specified. No markdown, no explanations, no preamble.`;

function buildUserPrompt(business: Business): string {
  const zipMatch = business.address.match(/\b(\d{5}(?:-\d{4})?)\b/);
  const zip = zipMatch ? zipMatch[1] : '';
  
  let reviews: Array<{ text: string; author: string; rating: number }> = [];
  try {
    const parsedReviews = JSON.parse(business.reviews || '[]');
    reviews = parsedReviews.map((r: { text?: string; authorDisplayName?: string; rating?: number }) => ({
      text: r.text || '',
      author: r.authorDisplayName || 'Anonymous',
      rating: r.rating || 5
    }));
  } catch {
    reviews = [];
  }
  
  const businessData = {
    business_name: business.business_name,
    business_type: business.business_type,
    phone: business.phone,
    address: business.address,
    city: business.city,
    state: business.state,
    zip,
    rating: business.rating,
    rating_count: business.rating_count,
    hours: business.hours,
    reviews,
    google_maps_uri: business.google_maps_uri,
    primary_type: business.business_type
  };

  return `Using the business data below, generate landing page copy following this exact JSON structure:

{
  "hero": {
    "headline": "8-12 words, benefit-focused, include city if possible",
    "subheadline": "12-20 words, address customer pain point",
    "primaryCtaText": "4-6 words with phone number, e.g. 'Call Now (555) 123-4567'",
    "secondaryCtaText": "2-4 words, e.g. 'Get Free Quote'",
    "trustBadges": ["3 trust signals, 2-4 words each"]
  },
  "servicesSection": {
    "tagline": "2-3 words, e.g. 'WHAT WE OFFER'",
    "headline": "4-8 words, benefit-oriented",
    "subheadline": "15-25 words describing service range",
    "services": [
      {"icon": "LucideIconName", "title": "2-4 words", "description": "20-30 words"}
    ]
  },
  "whyChooseUs": {
    "tagline": "2-3 words",
    "headline": "5-10 words positioning as trusted choice",
    "benefits": [
      {"icon": "LucideIconName", "title": "2-5 words", "description": "15-25 words"}
    ]
  },
  "serviceArea": {
    "headline": "5-10 words emphasizing local area",
    "hoursHeadline": "2-5 words label for hours",
    "hoursSubtext": "8-15 words about availability",
    "phoneHeadline": "2-4 words above phone"
  },
  "emergencyCta": {
    "headline": "3-6 words, urgent",
    "subheadline": "15-25 words reassuring help is available",
    "ctaText": "4-8 words with phone number"
  },
  "contactSection": {
    "tagline": "2-3 words",
    "trustBadges": ["5 trust signals, 3-6 words each"],
    "servingNote": "15-25 words geographic statement"
  },
  "seo": {
    "title": "50-60 chars for browser/search",
    "description": "150-160 chars meta description with phone",
    "keywords": "10-15 comma-separated keywords",
    "schemaType": "Plumber|Accountant|Chiropractor|HVACBusiness|Electrician|LocalBusiness"
  },
  "theme": {
    "primary": "HSL without hsl(), e.g. '224 64% 33%'",
    "primaryDark": "darker variant",
    "accent": "CTA color contrasting with primary",
    "accentHover": "darker accent for hover"
  }
}

Available icons: Wrench, Droplets, Flame, Settings, Shield, Clock, Zap, Award, DollarSign, ThumbsUp, Building, Calculator, FileText, TrendingUp, Briefcase, Users, Lock, Heart, Star, MapPin, Thermometer, Wind, Home, CreditCard, CheckCircle, Leaf, Sparkles, Trash2, Warehouse, Headphones, Server, Cloud, Database, Network, Activity, HeartPulse, Baby, Dumbbell

Color guidelines by business type:
- Plumbers: Blue primary, Orange accent (trustworthy, urgent)
- Accountants/Tax: Green primary, Gold accent (professional, prosperous)
- HVAC: Blue primary, Red accent (reliable, temperature)
- Chiropractors: Teal primary, Coral accent (wellness, healing)
- Electricians: Yellow primary, Navy accent (energy, safety)
- Commercial Cleaning: Cyan primary, Green accent (clean, fresh)
- IT Support: Purple primary, Cyan accent (tech, modern)

Business Data:
${JSON.stringify(businessData, null, 2)}

Generate 6 services and 6 benefits relevant to this business type. Return ONLY the JSON object.`;
}

function flattenCopy(copy: LandingPageCopy): Record<string, string> {
  return {
    copy_hero_headline: copy.hero.headline,
    copy_hero_subheadline: copy.hero.subheadline,
    copy_hero_primary_cta: copy.hero.primaryCtaText,
    copy_hero_secondary_cta: copy.hero.secondaryCtaText,
    copy_hero_trust_badges: copy.hero.trustBadges.join(' | '),
    copy_services_tagline: copy.servicesSection.tagline,
    copy_services_headline: copy.servicesSection.headline,
    copy_services_subheadline: copy.servicesSection.subheadline,
    copy_services_items: JSON.stringify(copy.servicesSection.services),
    copy_why_tagline: copy.whyChooseUs.tagline,
    copy_why_headline: copy.whyChooseUs.headline,
    copy_why_benefits: JSON.stringify(copy.whyChooseUs.benefits),
    copy_area_headline: copy.serviceArea.headline,
    copy_area_hours_headline: copy.serviceArea.hoursHeadline,
    copy_area_hours_subtext: copy.serviceArea.hoursSubtext,
    copy_area_phone_headline: copy.serviceArea.phoneHeadline,
    copy_emergency_headline: copy.emergencyCta.headline,
    copy_emergency_subheadline: copy.emergencyCta.subheadline,
    copy_emergency_cta: copy.emergencyCta.ctaText,
    copy_contact_tagline: copy.contactSection.tagline,
    copy_contact_trust_badges: copy.contactSection.trustBadges.join(' | '),
    copy_contact_serving_note: copy.contactSection.servingNote,
    copy_seo_title: copy.seo.title,
    copy_seo_description: copy.seo.description,
    copy_seo_keywords: copy.seo.keywords,
    copy_seo_schema_type: copy.seo.schemaType,
    copy_theme_primary: copy.theme.primary,
    copy_theme_primary_dark: copy.theme.primaryDark,
    copy_theme_accent: copy.theme.accent,
    copy_theme_accent_hover: copy.theme.accentHover,
  };
}

async function generateCopy(business: Business): Promise<Record<string, string>> {
  const userPrompt = buildUserPrompt(business);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  let jsonStr = '';
  for (const block of response.content) {
    if (block.type === 'text') {
      jsonStr += block.text;
    }
  }

  // Extract JSON from response (handle potential markdown wrapping)
  jsonStr = jsonStr.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  const copy = JSON.parse(jsonStr) as LandingPageCopy;
  return flattenCopy(copy);
}

async function getBusinessesMissingCopy(placeIds?: string[]): Promise<Business[]> {
  const businesses: Business[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const command = new ScanCommand({
      TableName: BUSINESSES_TABLE_NAME,
      FilterExpression: placeIds 
        ? undefined  // If specific IDs provided, we'll filter after
        : 'attribute_not_exists(copy_generated) OR copy_generated = :false',
      ExpressionAttributeValues: placeIds ? undefined : { ':false': false },
      ExclusiveStartKey: lastKey,
    });

    const result = await docClient.send(command);
    const items = (result.Items || []) as Business[];
    
    if (placeIds) {
      businesses.push(...items.filter(b => placeIds.includes(b.place_id)));
    } else {
      businesses.push(...items);
    }
    
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return businesses;
}

async function updateBusinessWithCopy(placeId: string, copyFields: Record<string, string>): Promise<void> {
  const updateExpressionParts: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

  Object.entries(copyFields).forEach(([key, value], index) => {
    const attrName = `#attr${index}`;
    const attrValue = `:val${index}`;
    updateExpressionParts.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = value;
  });

  // Add copy_generated flag
  updateExpressionParts.push('#copyGen = :copyGenVal');
  expressionAttributeNames['#copyGen'] = 'copy_generated';
  expressionAttributeValues[':copyGenVal'] = true;

  // Add updated_at timestamp
  updateExpressionParts.push('#updatedAt = :updatedAtVal');
  expressionAttributeNames['#updatedAt'] = 'copy_updated_at';
  expressionAttributeValues[':updatedAtVal'] = new Date().toISOString();

  await docClient.send(new UpdateCommand({
    TableName: BUSINESSES_TABLE_NAME,
    Key: { place_id: placeId },
    UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  }));
}

interface JobInput {
  placeIds?: string[];
  allMissingCopy?: boolean;
  concurrency?: number;
}

async function main(): Promise<void> {
  console.log('=== LLM Copy Generation Task ===');
  console.log(`Table: ${BUSINESSES_TABLE_NAME}`);

  // Parse job input from environment
  const jobInputStr = process.env.JOB_INPUT;
  let jobInput: JobInput = {};
  
  if (jobInputStr) {
    try {
      jobInput = JSON.parse(jobInputStr);
    } catch (e) {
      console.warn('Could not parse JOB_INPUT, using defaults');
    }
  }

  const placeIds = jobInput.placeIds;
  const concurrency = jobInput.concurrency || 5;

  console.log(`Concurrency: ${concurrency}`);
  console.log(`Specific place IDs: ${placeIds ? placeIds.length : 'all missing copy'}`);

  // Get businesses that need copy
  const businesses = await getBusinessesMissingCopy(placeIds);
  console.log(`Found ${businesses.length} businesses needing copy generation`);

  if (businesses.length === 0) {
    console.log('No businesses need copy generation. Exiting.');
    return;
  }

  // Process with limited concurrency
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < businesses.length; i += concurrency) {
    const batch = businesses.slice(i, i + concurrency);
    
    await Promise.all(batch.map(async (business) => {
      try {
        console.log(`\nGenerating copy for: ${business.business_name} (${business.place_id})`);
        
        const copyFields = await generateCopy(business);
        await updateBusinessWithCopy(business.place_id, copyFields);
        
        processed++;
        console.log(`  ✓ Updated ${business.business_name}`);
      } catch (error) {
        failed++;
        console.error(`  ✗ Failed for ${business.business_name}:`, error);
      }
    }));

    console.log(`Progress: ${processed + failed}/${businesses.length}`);
  }

  console.log('\n=== Task Complete ===');
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
}

main().catch(error => {
  console.error('Task failed:', error);
  process.exit(1);
});

