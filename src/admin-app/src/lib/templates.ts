import { JobTemplate, RuleGroup } from '@/types/jobs';

// Mock templates storage
let mockTemplates: JobTemplate[] = [
  {
    id: 'template_1',
    name: 'Florida Service Providers',
    description: 'Search for service businesses in Florida',
    jobType: 'places',
    placesConfig: {
      businessTypes: ['Plumbers', 'Electricians', 'HVAC Technicians'],
      states: ['FL'],
      countPerType: 50,
    },
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'template_2',
    name: 'Generate Missing Copy',
    description: 'Generate copy for all businesses without existing copy',
    jobType: 'copy',
    copyConfig: {
      rules: {
        id: 'group_1',
        logic: 'AND',
        rules: [
          { id: 'rule_1', field: 'has_generated_copy', operator: 'is_null' },
        ],
      },
    },
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'template_3',
    name: 'Full Pipeline - Texas',
    description: 'Run full pipeline for Texas businesses',
    jobType: 'both',
    placesConfig: {
      businessTypes: ['Accountants', 'Tax Preparers', 'Financial Advisors'],
      states: ['TX'],
      countPerType: 30,
    },
    copyConfig: {
      rules: {
        id: 'group_2',
        logic: 'AND',
        rules: [
          { id: 'rule_2', field: 'state', operator: 'equals', value: 'TX' },
          { id: 'rule_3', field: 'has_generated_copy', operator: 'is_null' },
        ],
      },
    },
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// Simulate API delay
const delay = (ms: number = 300 + Math.random() * 300) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const getTemplates = async (): Promise<JobTemplate[]> => {
  await delay();
  return [...mockTemplates];
};

export const getTemplate = async (id: string): Promise<JobTemplate | null> => {
  await delay();
  return mockTemplates.find((t) => t.id === id) || null;
};

export const createTemplate = async (template: Omit<JobTemplate, 'id' | 'createdAt'>): Promise<JobTemplate> => {
  await delay();
  const newTemplate: JobTemplate = {
    ...template,
    id: `template_${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  mockTemplates.unshift(newTemplate);
  return newTemplate;
};

export const updateTemplate = async (id: string, updates: Partial<JobTemplate>): Promise<JobTemplate> => {
  await delay();
  const index = mockTemplates.findIndex((t) => t.id === id);
  if (index === -1) throw new Error('Template not found');
  
  mockTemplates[index] = { ...mockTemplates[index], ...updates };
  return mockTemplates[index];
};

export const deleteTemplate = async (id: string): Promise<boolean> => {
  await delay();
  const index = mockTemplates.findIndex((t) => t.id === id);
  if (index === -1) return false;
  
  mockTemplates.splice(index, 1);
  return true;
};
