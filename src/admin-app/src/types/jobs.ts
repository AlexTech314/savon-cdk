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

export interface JobTemplate {
  id: string;
  name: string;
  description?: string;
  jobType: 'places' | 'copy' | 'both';
  placesConfig?: PlacesConfig;
  copyConfig?: CopyConfig;
  createdAt: string;
}

export interface JobConfig {
  jobType: 'places' | 'copy' | 'both';
  placesConfig?: PlacesConfig;
  copyConfig?: CopyConfig;
  templateId?: string;
  templateName?: string;
}

export interface Job {
  job_id: string;
  job_type: 'places' | 'copy' | 'both';
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  config?: JobConfig;
  input: {
    business_types?: string[];
    states?: string[];
    limit?: number;
  };
  error?: string;
  records_processed?: number;
  records_total?: number;
  matched_rules?: number;
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
  { key: 'has_generated_copy', label: 'Has Generated Copy', type: 'boolean' },
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

// Google Places API place types (for includedType parameter)
export const PLACE_TYPES = [
  { value: 'plumber', label: 'Plumber' },
  { value: 'electrician', label: 'Electrician' },
  { value: 'locksmith', label: 'Locksmith' },
  { value: 'pet_grooming', label: 'Pet Grooming' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'car_repair', label: 'Car Repair' },
  { value: 'florist', label: 'Florist' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'hair_salon', label: 'Hair Salon' },
  { value: 'dentist', label: 'Dentist' },
  { value: 'veterinary_care', label: 'Veterinary Care' },
  { value: 'moving_company', label: 'Moving Company' },
  { value: 'roofing_contractor', label: 'Roofing Contractor' },
  { value: 'painter', label: 'Painter' },
  { value: 'landscaper', label: 'Landscaper' },
  { value: 'hvac_contractor', label: 'HVAC Contractor' },
  { value: 'pest_control', label: 'Pest Control' },
  { value: 'cleaning_service', label: 'Cleaning Service' },
  { value: 'accounting', label: 'Accounting' },
  { value: 'lawyer', label: 'Lawyer' },
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
