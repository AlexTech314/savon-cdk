import { Business, Job } from './types';

const businessTypes = ['Plumber', 'HVAC Contractor', 'Electrician'];
const states = ['CA', 'TX', 'FL', 'NY', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI'];
const cities: Record<string, string[]> = {
  CA: ['Los Angeles', 'San Diego', 'San Francisco', 'Sacramento', 'Fresno'],
  TX: ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth'],
  FL: ['Miami', 'Tampa', 'Orlando', 'Jacksonville', 'Fort Lauderdale'],
  NY: ['New York', 'Buffalo', 'Rochester', 'Syracuse', 'Albany'],
  IL: ['Chicago', 'Aurora', 'Naperville', 'Rockford', 'Joliet'],
  PA: ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading'],
  OH: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron'],
  GA: ['Atlanta', 'Augusta', 'Columbus', 'Savannah', 'Athens'],
  NC: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem'],
  MI: ['Detroit', 'Grand Rapids', 'Warren', 'Sterling Heights', 'Lansing'],
};

const businessNames: Record<string, string[]> = {
  Plumber: [
    'Pro Plumbing Services', 'Quick Fix Plumbers', 'Master Drain Solutions',
    'Elite Pipe Repair', 'Valley Plumbing Co', 'Precision Plumbing',
    'AllStar Plumbers', 'Premier Pipe Services', 'Rapid Response Plumbing',
    'Summit Plumbing Experts',
  ],
  'HVAC Contractor': [
    'Cool Air Systems', 'Climate Control Pros', 'Arctic Air HVAC',
    'Comfort Zone Heating & Cooling', 'Premier Climate Solutions',
    'All Seasons HVAC', 'TruTemp Services', 'AirFlow Experts',
    'Total Comfort HVAC', 'EcoAir Solutions',
  ],
  Electrician: [
    'Spark Electric Co', 'Power Pro Electrical', 'Voltage Masters',
    'Elite Electrical Services', 'Current Solutions', 'Bright Wire Electric',
    'Circuit Pro Electric', 'Reliable Power Services', 'Amp Up Electric',
    'Lightning Fast Electrical',
  ],
};

const services: Record<string, string[]> = {
  Plumber: ['Drain Cleaning', 'Pipe Repair', 'Water Heater Installation', 'Leak Detection', 'Sewer Line Repair'],
  'HVAC Contractor': ['AC Installation', 'Furnace Repair', 'Duct Cleaning', 'Heat Pump Service', 'Thermostat Installation'],
  Electrician: ['Panel Upgrades', 'Outlet Installation', 'Lighting Design', 'Generator Installation', 'Electrical Inspections'],
};

const generatePhone = (): string => {
  const area = Math.floor(Math.random() * 900) + 100;
  const mid = Math.floor(Math.random() * 900) + 100;
  const last = Math.floor(Math.random() * 9000) + 1000;
  return `(${area}) ${mid}-${last}`;
};

const generateSlug = (name: string, city: string): string => {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${city.toLowerCase()}`;
};

const generateCopy = (business: Partial<Business>): Business['generated_copy'] | undefined => {
  if (Math.random() > 0.6) return undefined;
  
  const type = business.business_type || 'Plumber';
  const serviceList = services[type] || services.Plumber;
  
  return {
    headline: `${business.city}'s Most Trusted ${type}`,
    tagline: `Professional ${type.toLowerCase()} services you can count on`,
    services: serviceList.slice(0, 3 + Math.floor(Math.random() * 2)),
    about: `${business.name} has been serving ${business.city} and surrounding areas for over ${5 + Math.floor(Math.random() * 20)} years. Our team of licensed professionals is committed to providing exceptional service and guaranteed satisfaction.`,
  };
};

export const generateMockBusinesses = (count: number = 50): Business[] => {
  const businesses: Business[] = [];
  
  for (let i = 0; i < count; i++) {
    const businessType = businessTypes[i % 3];
    const state = states[Math.floor(Math.random() * states.length)];
    const city = cities[state][Math.floor(Math.random() * cities[state].length)];
    const nameList = businessNames[businessType];
    const name = nameList[Math.floor(Math.random() * nameList.length)] + (i > 30 ? ` #${i - 29}` : '');
    
    const createdDate = new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000);
    const updatedDate = new Date(createdDate.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000);
    
    const business: Business = {
      place_id: `ChIJ${Math.random().toString(36).substring(2, 15)}`,
      name,
      business_type: businessType,
      address: `${1000 + Math.floor(Math.random() * 9000)} ${['Main', 'Oak', 'Maple', 'Cedar', 'Pine'][Math.floor(Math.random() * 5)]} Street`,
      city,
      state,
      phone: generatePhone(),
      website: Math.random() > 0.3 ? `https://www.${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com` : undefined,
      rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
      review_count: Math.floor(Math.random() * 200) + 10,
      friendly_slug: generateSlug(name, city),
      created_at: createdDate.toISOString(),
      updated_at: updatedDate.toISOString(),
    };
    
    business.generated_copy = generateCopy(business);
    businesses.push(business);
  }
  
  return businesses;
};

export const generateMockJobs = (count: number = 10): Job[] => {
  const jobs: Job[] = [];
  const statuses: Job['status'][] = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'];
  const jobTypes: Job['job_type'][] = ['places', 'copy', 'both'];
  
  for (let i = 0; i < count; i++) {
    const status = i === 0 ? 'RUNNING' : statuses[Math.floor(Math.random() * statuses.length)];
    const jobType = jobTypes[Math.floor(Math.random() * jobTypes.length)];
    const createdDate = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);
    const startedDate = status !== 'PENDING' ? new Date(createdDate.getTime() + Math.random() * 60000) : undefined;
    const completedDate = ['SUCCEEDED', 'FAILED'].includes(status) && startedDate 
      ? new Date(startedDate.getTime() + Math.random() * 300000) 
      : undefined;
    
    const job: Job = {
      job_id: `job_${Math.random().toString(36).substring(2, 10)}`,
      job_type: jobType,
      status,
      created_at: createdDate.toISOString(),
      started_at: startedDate?.toISOString(),
      completed_at: completedDate?.toISOString(),
      input: {
        business_types: jobType !== 'copy' ? ['Plumber', 'HVAC Contractor'].slice(0, 1 + Math.floor(Math.random() * 2)) : undefined,
        states: jobType !== 'copy' ? ['CA', 'TX', 'FL'].slice(0, 1 + Math.floor(Math.random() * 3)) : undefined,
        limit: Math.random() > 0.5 ? 50 + Math.floor(Math.random() * 150) : undefined,
      },
      records_processed: status === 'SUCCEEDED' ? Math.floor(Math.random() * 100) + 20 : undefined,
      error: status === 'FAILED' ? 'Rate limit exceeded. Please try again later.' : undefined,
    };
    
    jobs.push(job);
  }
  
  return jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

// Store mock data in memory
export let mockBusinesses = generateMockBusinesses(50);
export let mockJobs = generateMockJobs(10);

export const resetMockData = () => {
  mockBusinesses = generateMockBusinesses(50);
  mockJobs = generateMockJobs(10);
};
