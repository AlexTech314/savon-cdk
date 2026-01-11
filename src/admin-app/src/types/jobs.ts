// Job Configuration Types

export interface Rule {
  id: string;
  field: string;
  operator: RuleOperator;
  value?: string | number | boolean;
}

export type RuleOperator = 
  | 'equals' 
  | 'not_equals' 
  | 'contains' 
  | 'not_contains' 
  | 'is_null' 
  | 'is_not_null' 
  | 'greater_than' 
  | 'less_than';

export interface RuleGroup {
  id: string;
  logic: 'AND' | 'OR';
  rules: (Rule | RuleGroup)[];
}

export interface SearchQuery {
  textQuery: string;
  includedType?: string;
}

/**
 * Data tier determines which Google Places API fields are fetched during search.
 * Higher tiers cost more but get more data in a single call.
 */
export type DataTier = 'pro' | 'enterprise' | 'enterprise_atmosphere';

/**
 * Data tier configuration with labels and descriptions
 */
export const DATA_TIERS: { 
  value: DataTier; 
  label: string; 
  cost: number;
  description: string;
  includes: string[];
}[] = [
  { 
    value: 'pro', 
    label: 'Pro', 
    cost: 32,
    description: 'Basic business data - address, location, types, status',
    includes: [
      'Business name & type',
      'Full address (street, city, state, zip)',
      'GPS coordinates',
      'Business status (open/closed)',
      'Google Maps link',
    ],
  },
  { 
    value: 'enterprise', 
    label: 'Enterprise', 
    cost: 35,
    description: 'Contact & ratings data - everything needed for outreach',
    includes: [
      'Everything in Pro',
      'Phone number',
      'Website URL',
      'Rating & review count',
      'Business hours',
      'Price level',
    ],
  },
  { 
    value: 'enterprise_atmosphere', 
    label: 'Enterprise + Atmosphere', 
    cost: 40,
    description: 'Complete data - includes reviews and atmosphere info',
    includes: [
      'Everything in Enterprise',
      'Customer reviews (top 5)',
      'Editorial summary',
      'Service options (delivery, dine-in, takeout)',
      'Atmosphere (outdoor seating, reservations, etc.)',
      'Accessibility options',
    ],
  },
];

export interface PlacesConfig {
  searches: SearchQuery[];
  maxResultsPerSearch?: number;
  onlyWithoutWebsite?: boolean;
}

// Legacy config for backwards compatibility
export interface LegacyPlacesConfig {
  businessTypes: string[];
  states: string[];
  countPerType: number;
}

export interface CopyConfig {
  rules: RuleGroup;
}

// Campaign = saved search configuration for finding leads
// Note: searches are stored in S3 and only included when fetching a single campaign
export interface Campaign {
  campaign_id: string;
  name: string;
  description?: string;
  searches?: SearchQuery[];      // Only present when fetching single campaign (from S3)
  searches_count: number;        // Always present - count for display
  max_results_per_search: number;
  only_without_website: boolean;
  data_tier: DataTier;
  created_at: string;
  updated_at: string;
  last_run_at?: string;
}

// API response for create/update includes upload URL
export interface CampaignCreateResponse {
  campaign: Campaign;
  uploadUrl: string;
  message?: string;
}

export interface CampaignUpdateResponse {
  campaign: Campaign;
  uploadUrl?: string;  // Only present if updateSearches was requested
  message?: string;
}

// Input for creating campaigns (searches uploaded separately via presigned URL)
export interface CampaignInput {
  name: string;
  description?: string;
  maxResultsPerSearch?: number;
  onlyWithoutWebsite?: boolean;
  dataTier?: DataTier;
}

// Input for updating campaigns
export interface CampaignUpdateInput {
  name?: string;
  description?: string;
  maxResultsPerSearch?: number;
  onlyWithoutWebsite?: boolean;
  dataTier?: DataTier;
  updateSearches?: boolean;  // If true, response includes presigned URL
}

export interface Job {
  job_id: string;
  job_type: 'places'; // All campaign jobs are places (lead finding)
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
  campaign_id: string;
  campaign_name?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  input?: {
    campaignId: string;
    jobType: 'places';
    searches: SearchQuery[];
    maxResultsPerSearch: number;
    onlyWithoutWebsite: boolean;
  };
  error?: string;
}

// Field definitions for rule builder
export const RULE_FIELDS = [
  { key: 'name', label: 'Business Name', type: 'text' },
  { key: 'business_type', label: 'Business Type', type: 'select' },
  { key: 'state', label: 'State', type: 'select' },
  { key: 'city', label: 'City', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'website', label: 'Website', type: 'text' },
  { key: 'rating', label: 'Rating', type: 'number' },
  { key: 'review_count', label: 'Review Count', type: 'number' },
  { key: 'has_generated_copy', label: 'Has Generated Preview', type: 'boolean' },
  { key: 'created_at', label: 'Created Date', type: 'date' },
  { key: 'updated_at', label: 'Updated Date', type: 'date' },
] as const;

export const RULE_OPERATORS: Record<string, { label: string; needsValue: boolean }> = {
  equals: { label: 'equals', needsValue: true },
  not_equals: { label: 'does not equal', needsValue: true },
  contains: { label: 'contains', needsValue: true },
  not_contains: { label: 'does not contain', needsValue: true },
  is_null: { label: 'is empty', needsValue: false },
  is_not_null: { label: 'is not empty', needsValue: false },
  greater_than: { label: 'is greater than', needsValue: true },
  less_than: { label: 'is less than', needsValue: true },
};

// Google Places API place types (Table A - for includedType parameter)
// Source: https://developers.google.com/maps/documentation/places/web-service/place-types#table-a
export const PLACE_TYPES = [
  // Services
  { value: 'plumber', label: 'Plumber', category: 'Services' },
  { value: 'electrician', label: 'Electrician', category: 'Services' },
  { value: 'locksmith', label: 'Locksmith', category: 'Services' },
  { value: 'painter', label: 'Painter', category: 'Services' },
  { value: 'roofing_contractor', label: 'Roofing Contractor', category: 'Services' },
  { value: 'moving_company', label: 'Moving Company', category: 'Services' },
  { value: 'florist', label: 'Florist', category: 'Services' },
  { value: 'laundry', label: 'Laundry', category: 'Services' },
  { value: 'barber_shop', label: 'Barber Shop', category: 'Services' },
  { value: 'beauty_salon', label: 'Beauty Salon', category: 'Services' },
  { value: 'hair_salon', label: 'Hair Salon', category: 'Services' },
  { value: 'nail_salon', label: 'Nail Salon', category: 'Services' },
  { value: 'insurance_agency', label: 'Insurance Agency', category: 'Services' },
  { value: 'lawyer', label: 'Lawyer', category: 'Services' },
  { value: 'real_estate_agency', label: 'Real Estate Agency', category: 'Services' },
  { value: 'travel_agency', label: 'Travel Agency', category: 'Services' },
  { value: 'funeral_home', label: 'Funeral Home', category: 'Services' },
  { value: 'storage', label: 'Storage', category: 'Services' },
  { value: 'veterinary_care', label: 'Veterinary Care', category: 'Services' },
  { value: 'child_care_agency', label: 'Child Care Agency', category: 'Services' },
  { value: 'consultant', label: 'Consultant', category: 'Services' },
  { value: 'courier_service', label: 'Courier Service', category: 'Services' },
  { value: 'catering_service', label: 'Catering Service', category: 'Services' },
  // Finance
  { value: 'accounting', label: 'Accounting', category: 'Finance' },
  { value: 'bank', label: 'Bank', category: 'Finance' },
  { value: 'atm', label: 'ATM', category: 'Finance' },
  // Automotive
  { value: 'car_dealer', label: 'Car Dealer', category: 'Automotive' },
  { value: 'car_rental', label: 'Car Rental', category: 'Automotive' },
  { value: 'car_repair', label: 'Car Repair', category: 'Automotive' },
  { value: 'car_wash', label: 'Car Wash', category: 'Automotive' },
  { value: 'gas_station', label: 'Gas Station', category: 'Automotive' },
  { value: 'parking', label: 'Parking', category: 'Automotive' },
  { value: 'electric_vehicle_charging_station', label: 'EV Charging Station', category: 'Automotive' },
  // Health & Wellness
  { value: 'dentist', label: 'Dentist', category: 'Health' },
  { value: 'dental_clinic', label: 'Dental Clinic', category: 'Health' },
  { value: 'doctor', label: 'Doctor', category: 'Health' },
  { value: 'hospital', label: 'Hospital', category: 'Health' },
  { value: 'pharmacy', label: 'Pharmacy', category: 'Health' },
  { value: 'drugstore', label: 'Drugstore', category: 'Health' },
  { value: 'physiotherapist', label: 'Physiotherapist', category: 'Health' },
  { value: 'chiropractor', label: 'Chiropractor', category: 'Health' },
  { value: 'spa', label: 'Spa', category: 'Health' },
  { value: 'gym', label: 'Gym', category: 'Health' },
  { value: 'fitness_center', label: 'Fitness Center', category: 'Health' },
  { value: 'yoga_studio', label: 'Yoga Studio', category: 'Health' },
  { value: 'massage', label: 'Massage', category: 'Health' },
  { value: 'wellness_center', label: 'Wellness Center', category: 'Health' },
  // Food & Drink
  { value: 'restaurant', label: 'Restaurant', category: 'Food' },
  { value: 'bakery', label: 'Bakery', category: 'Food' },
  { value: 'cafe', label: 'Cafe', category: 'Food' },
  { value: 'coffee_shop', label: 'Coffee Shop', category: 'Food' },
  { value: 'bar', label: 'Bar', category: 'Food' },
  { value: 'pizza_restaurant', label: 'Pizza Restaurant', category: 'Food' },
  { value: 'fast_food_restaurant', label: 'Fast Food', category: 'Food' },
  { value: 'ice_cream_shop', label: 'Ice Cream Shop', category: 'Food' },
  { value: 'meal_delivery', label: 'Meal Delivery', category: 'Food' },
  { value: 'meal_takeaway', label: 'Meal Takeaway', category: 'Food' },
  // Shopping
  { value: 'grocery_store', label: 'Grocery Store', category: 'Shopping' },
  { value: 'supermarket', label: 'Supermarket', category: 'Shopping' },
  { value: 'convenience_store', label: 'Convenience Store', category: 'Shopping' },
  { value: 'clothing_store', label: 'Clothing Store', category: 'Shopping' },
  { value: 'shoe_store', label: 'Shoe Store', category: 'Shopping' },
  { value: 'jewelry_store', label: 'Jewelry Store', category: 'Shopping' },
  { value: 'furniture_store', label: 'Furniture Store', category: 'Shopping' },
  { value: 'electronics_store', label: 'Electronics Store', category: 'Shopping' },
  { value: 'hardware_store', label: 'Hardware Store', category: 'Shopping' },
  { value: 'home_improvement_store', label: 'Home Improvement Store', category: 'Shopping' },
  { value: 'pet_store', label: 'Pet Store', category: 'Shopping' },
  { value: 'book_store', label: 'Book Store', category: 'Shopping' },
  { value: 'liquor_store', label: 'Liquor Store', category: 'Shopping' },
  { value: 'shopping_mall', label: 'Shopping Mall', category: 'Shopping' },
  // Lodging
  { value: 'hotel', label: 'Hotel', category: 'Lodging' },
  { value: 'motel', label: 'Motel', category: 'Lodging' },
  { value: 'lodging', label: 'Lodging', category: 'Lodging' },
  { value: 'campground', label: 'Campground', category: 'Lodging' },
  { value: 'rv_park', label: 'RV Park', category: 'Lodging' },
  // Entertainment & Recreation
  { value: 'movie_theater', label: 'Movie Theater', category: 'Entertainment' },
  { value: 'bowling_alley', label: 'Bowling Alley', category: 'Entertainment' },
  { value: 'casino', label: 'Casino', category: 'Entertainment' },
  { value: 'night_club', label: 'Night Club', category: 'Entertainment' },
  { value: 'amusement_park', label: 'Amusement Park', category: 'Entertainment' },
  { value: 'aquarium', label: 'Aquarium', category: 'Entertainment' },
  { value: 'zoo', label: 'Zoo', category: 'Entertainment' },
  { value: 'park', label: 'Park', category: 'Entertainment' },
  // Education
  { value: 'school', label: 'School', category: 'Education' },
  { value: 'university', label: 'University', category: 'Education' },
  { value: 'library', label: 'Library', category: 'Education' },
  { value: 'preschool', label: 'Preschool', category: 'Education' },
];

// Legacy business types for backwards compatibility
export const BUSINESS_TYPES = [
  'Accountants',
  'Bookkeepers',
  'Tax Preparers',
  'Attorneys',
  'Financial Advisors',
  'Insurance Agents',
  'Notaries',
  'Plumbers',
  'HVAC Technicians',
  'Electricians',
  'Septic/Drain Cleaning',
  'Pest Control',
  'Locksmiths',
  'IT Support',
  'Payroll Services',
  'HR Consultants',
  'Commercial Cleaning',
  'Document Shredding',
  'Junk Removal',
  'Moving Companies',
  'Appliance Repair',
  'Chiropractors',
  'Physical Therapists',
  'Massage Therapists',
  'Counselors/Therapists',
];

// US States
export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];
