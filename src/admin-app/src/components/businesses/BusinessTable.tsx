import React, { useState, useEffect, useMemo } from 'react';
import { Business } from '@/lib/types';
import { 
  generateDetails, 
  generateReviews, 
  generatePhotos, 
  generateCopy,
} from '@/lib/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  Loader2,
  ExternalLink,
  Settings2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Column definition type
interface ColumnDef {
  key: string;
  label: string;
  sortable: boolean;
  defaultVisible: boolean;
  category: 'core' | 'contact' | 'location' | 'metrics' | 'pipeline' | 'scrape' | 'meta';
  render?: (business: Business) => React.ReactNode;
}

// All available columns
const ALL_COLUMNS: ColumnDef[] = [
  // Core
  { key: 'name', label: 'Business Name', sortable: true, defaultVisible: true, category: 'core' },
  { key: 'business_type', label: 'Type', sortable: true, defaultVisible: true, category: 'core' },
  
  // Location
  { key: 'address', label: 'Address', sortable: true, defaultVisible: false, category: 'location' },
  { key: 'city', label: 'City', sortable: true, defaultVisible: true, category: 'location' },
  { key: 'state', label: 'State', sortable: true, defaultVisible: true, category: 'location' },
  
  // Contact
  { key: 'phone', label: 'Phone', sortable: true, defaultVisible: false, category: 'contact' },
  { key: 'website', label: 'Website', sortable: false, defaultVisible: false, category: 'contact' },
  
  // Metrics
  { key: 'rating', label: 'Rating', sortable: true, defaultVisible: false, category: 'metrics' },
  { key: 'review_count', label: 'Reviews', sortable: true, defaultVisible: false, category: 'metrics' },
  
  // Pipeline
  { key: 'pipeline', label: 'Pipeline', sortable: false, defaultVisible: true, category: 'pipeline' },
  { key: 'data_tier', label: 'Data Tier', sortable: true, defaultVisible: false, category: 'pipeline' },
  { key: 'has_website', label: 'Has Site', sortable: true, defaultVisible: false, category: 'pipeline' },
  
  // Web Scrape
  { key: 'web_scraped', label: 'Scraped', sortable: true, defaultVisible: false, category: 'scrape' },
  { key: 'web_scrape_status', label: 'Status', sortable: true, defaultVisible: false, category: 'scrape' },
  { key: 'web_scraped_at', label: 'Scraped At', sortable: true, defaultVisible: false, category: 'scrape' },
  { key: 'web_pages_count', label: 'Pages', sortable: true, defaultVisible: false, category: 'scrape' },
  { key: 'web_scrape_method', label: 'Method', sortable: true, defaultVisible: false, category: 'scrape' },
  { key: 'web_total_bytes', label: 'Size', sortable: true, defaultVisible: false, category: 'scrape' },
  { key: 'web_scrape_duration_ms', label: 'Duration', sortable: true, defaultVisible: false, category: 'scrape' },
  { key: 'web_emails', label: 'Emails', sortable: false, defaultVisible: false, category: 'scrape' },
  { key: 'web_phones', label: 'Phones', sortable: false, defaultVisible: false, category: 'scrape' },
  { key: 'web_founded_year', label: 'Founded', sortable: true, defaultVisible: false, category: 'scrape' },
  { key: 'web_years_in_business', label: 'Years', sortable: true, defaultVisible: false, category: 'scrape' },
  { key: 'web_headcount_estimate', label: 'Headcount', sortable: true, defaultVisible: false, category: 'scrape' },
  { key: 'web_team_count', label: 'Team', sortable: true, defaultVisible: false, category: 'scrape' },
  { key: 'web_contact_page', label: 'Contact URL', sortable: false, defaultVisible: false, category: 'scrape' },
  { key: 'web_social_facebook', label: 'Facebook', sortable: false, defaultVisible: false, category: 'scrape' },
  { key: 'web_social_instagram', label: 'Instagram', sortable: false, defaultVisible: false, category: 'scrape' },
  { key: 'web_social_linkedin', label: 'LinkedIn', sortable: false, defaultVisible: false, category: 'scrape' },
  
  // Meta
  { key: 'friendly_slug', label: 'Slug', sortable: true, defaultVisible: false, category: 'meta' },
  { key: 'created_at', label: 'Created', sortable: true, defaultVisible: false, category: 'meta' },
  { key: 'updated_at', label: 'Updated', sortable: true, defaultVisible: false, category: 'meta' },
  
  // Actions (always visible)
  { key: 'preview', label: 'Preview', sortable: false, defaultVisible: true, category: 'core' },
];

const CATEGORY_LABELS: Record<string, string> = {
  core: 'Core',
  contact: 'Contact',
  location: 'Location',
  metrics: 'Metrics',
  pipeline: 'Pipeline',
  scrape: 'Web Scrape',
  meta: 'Metadata',
};

const STORAGE_KEY = 'business-table-visible-columns';

// Pipeline step configuration
type PipelineStep = 'search' | 'details' | 'reviews' | 'photos' | 'copy';

const PIPELINE_STEPS: {
  id: PipelineStep;
  label: string;
  doneKey: keyof Business;
  requires: (keyof Business)[];
  tooltip: { done: string; pending: string; blocked: string };
}[] = [
  { 
    id: 'search', 
    label: 'S', 
    doneKey: 'searched',
    requires: [],
    tooltip: { done: 'Searched', pending: 'Not searched', blocked: 'Cannot run search from here' }
  },
  { 
    id: 'details', 
    label: 'D', 
    doneKey: 'details_fetched',
    requires: ['searched'],
    tooltip: { done: 'Details fetched', pending: 'Click to fetch details', blocked: 'Requires: Search' }
  },
  { 
    id: 'reviews', 
    label: 'R', 
    doneKey: 'reviews_fetched',
    requires: ['details_fetched'],
    tooltip: { done: 'Reviews fetched', pending: 'Click to fetch reviews', blocked: 'Requires: Details' }
  },
  { 
    id: 'photos', 
    label: 'P', 
    doneKey: 'photos_fetched',
    requires: ['details_fetched'],
    tooltip: { done: 'Photos fetched', pending: 'Click to fetch photos', blocked: 'Requires: Details' }
  },
  { 
    id: 'copy', 
    label: 'C', 
    doneKey: 'copy_generated',
    requires: ['reviews_fetched'],
    tooltip: { done: 'Copy generated', pending: 'Click to generate copy', blocked: 'Requires: Reviews' }
  },
];

// Pipeline status badge component
const PipelineStatusBadge: React.FC<{ 
  label: string; 
  done: boolean; 
  tooltip: string;
  canRun: boolean;
  isLoading: boolean;
  onClick?: () => void;
}> = ({ label, done, tooltip, canRun, isLoading, onClick }) => {
  const isClickable = !done && canRun && onClick && !isLoading;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isClickable && onClick) onClick();
            }}
            disabled={!isClickable}
            className={cn(
              'inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold transition-all',
              done 
                ? 'bg-green-500/20 text-green-600 dark:text-green-400' 
                : isClickable
                  ? 'bg-primary/20 text-primary hover:bg-primary/30 cursor-pointer hover:scale-110'
                  : 'bg-muted text-muted-foreground',
              isLoading && 'animate-pulse'
            )}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              label
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Pipeline status display component with clickable badges
const PipelineStatus: React.FC<{ 
  business: Business;
  onStepComplete: (stepDoneKey: keyof Business) => void;
}> = ({ business, onStepComplete }) => {
  const { toast } = useToast();
  const [loadingStep, setLoadingStep] = useState<PipelineStep | null>(null);

  const handleRunStep = async (step: PipelineStep, stepDoneKey: keyof Business) => {
    setLoadingStep(step);
    try {
      switch (step) {
        case 'details':
          await generateDetails(business.place_id);
          toast({ title: 'Details Fetched', description: `Updated ${business.name}` });
          break;
        case 'reviews':
          await generateReviews(business.place_id);
          toast({ title: 'Reviews Fetched', description: `Updated ${business.name}` });
          break;
        case 'photos':
          await generatePhotos(business.place_id);
          toast({ title: 'Photos Fetched', description: `Updated ${business.name}` });
          break;
        case 'copy':
          await generateCopy(business.place_id);
          toast({ title: 'Copy Generated', description: `Updated ${business.name}` });
          break;
        default:
          toast({ title: 'Not Supported', description: 'This step cannot be run individually', variant: 'destructive' });
          return;
      }
      onStepComplete(stepDoneKey);
    } catch (error) {
      console.error(`Failed to run ${step}:`, error);
      toast({ 
        title: 'Error', 
        description: `Failed to run ${step} for ${business.name}`,
        variant: 'destructive'
      });
    } finally {
      setLoadingStep(null);
    }
  };

  const checkDependencies = (requires: (keyof Business)[]) => {
    return requires.every(dep => !!business[dep]);
  };

  return (
    <div className="flex items-center gap-0.5">
      {PIPELINE_STEPS.map((step) => {
        const isDone = !!business[step.doneKey];
        const canRun = step.id !== 'search' && checkDependencies(step.requires);
        const tooltip = isDone 
          ? step.tooltip.done 
          : canRun 
            ? step.tooltip.pending 
            : step.tooltip.blocked;

        return (
          <PipelineStatusBadge
            key={step.id}
            label={step.label}
            done={isDone}
            tooltip={tooltip}
            canRun={canRun}
            isLoading={loadingStep === step.id}
            onClick={canRun && !isDone ? () => handleRunStep(step.id, step.doneKey) : undefined}
          />
        );
      })}
    </div>
  );
};

// Format cell value based on column type
const formatCellValue = (
  business: Business, 
  column: ColumnDef,
  onStepComplete: (stepDoneKey: keyof Business) => void
): React.ReactNode => {
  const value = business[column.key as keyof Business];
  
  switch (column.key) {
    case 'name':
      return <span className="font-medium">{value as string}</span>;
    
    case 'business_type':
      return <Badge variant="secondary">{value as string}</Badge>;
    
    case 'website':
      if (!value) return <span className="text-muted-foreground">—</span>;
      return (
        <a 
          href={value as string} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-primary hover:underline text-sm truncate max-w-[150px] block"
          onClick={(e) => e.stopPropagation()}
        >
          {(value as string).replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
        </a>
      );
    
    case 'phone':
      if (!value) return <span className="text-muted-foreground">—</span>;
      return (
        <a 
          href={`tel:${value}`}
          className="text-primary hover:underline text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {value as string}
        </a>
      );
    
    case 'rating':
      if (!value) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="flex items-center gap-1">
          <span className="text-yellow-500">★</span>
          {(value as number).toFixed(1)}
        </span>
      );
    
    case 'review_count':
      if (!value) return <span className="text-muted-foreground">—</span>;
      return <span>{value as number} reviews</span>;
    
    case 'data_tier':
      if (!value) return <span className="text-muted-foreground">—</span>;
      const tierLabels: Record<string, string> = {
        pro: 'Pro',
        enterprise: 'Enterprise',
        enterprise_atmosphere: 'Ent+Atm',
      };
      return <Badge variant="outline">{tierLabels[value as string] || String(value)}</Badge>;
    
    case 'has_website':
      return value ? (
        <Badge variant="secondary" className="bg-green-500/10 text-green-600">Yes</Badge>
      ) : (
        <Badge variant="secondary" className="bg-red-500/10 text-red-600">No</Badge>
      );
    
    case 'pipeline':
      return (
        <PipelineStatus 
          business={business} 
          onStepComplete={onStepComplete}
        />
      );
    
    case 'preview':
      return (
        <a 
          href={`https://alpha.savondesigns.com/preview/${business.place_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline text-sm flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
          Preview
        </a>
      );
    
    case 'created_at':
    case 'updated_at':
      if (!value) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="text-sm text-muted-foreground">
          {new Date(value as string).toLocaleDateString()}
        </span>
      );
    
    case 'friendly_slug':
      if (!value) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="font-mono text-xs text-muted-foreground truncate max-w-[120px] block">
          {value as string}
        </span>
      );
    
    case 'web_scraped':
      return value ? (
        <Badge variant="secondary" className="bg-green-500/10 text-green-600">Yes</Badge>
      ) : (
        <Badge variant="secondary" className="bg-muted text-muted-foreground">No</Badge>
      );
    
    case 'web_scraped_at':
      if (!value) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="text-sm text-muted-foreground">
          {new Date(value as string).toLocaleDateString()}
        </span>
      );
    
    case 'web_pages_count':
      if (!value) return <span className="text-muted-foreground">—</span>;
      return <span>{value as number} pages</span>;
    
    case 'web_scrape_method':
      if (!value) return <span className="text-muted-foreground">—</span>;
      return (
        <Badge variant="outline">
          {value === 'puppeteer' ? 'Puppeteer' : 'Fetch'}
        </Badge>
      );
    
    case 'web_total_bytes':
      if (!value) return <span className="text-muted-foreground">—</span>;
      const bytes = value as number;
      const kb = bytes / 1024;
      const mb = kb / 1024;
      return <span>{mb >= 1 ? `${mb.toFixed(1)} MB` : `${kb.toFixed(0)} KB`}</span>;
    
    case 'web_scrape_duration_ms':
      if (!value) return <span className="text-muted-foreground">—</span>;
      const ms = value as number;
      return <span>{ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`}</span>;
    
    case 'web_scrape_status':
      if (!value) return <span className="text-muted-foreground">—</span>;
      const statusColors: Record<string, string> = {
        complete: 'bg-green-500/10 text-green-600',
        partial: 'bg-yellow-500/10 text-yellow-600',
        failed: 'bg-red-500/10 text-red-600',
      };
      return (
        <Badge variant="secondary" className={statusColors[value as string] || ''}>
          {(value as string).charAt(0).toUpperCase() + (value as string).slice(1)}
        </Badge>
      );
    
    case 'web_emails':
      if (!value || (Array.isArray(value) && value.length === 0)) {
        return <span className="text-muted-foreground">—</span>;
      }
      const emails = value as string[];
      return (
        <span className="text-sm" title={emails.join(', ')}>
          {emails.length} email{emails.length !== 1 ? 's' : ''}
        </span>
      );
    
    case 'web_phones':
      if (!value || (Array.isArray(value) && value.length === 0)) {
        return <span className="text-muted-foreground">—</span>;
      }
      const phones = value as string[];
      return (
        <span className="text-sm" title={phones.join(', ')}>
          {phones.length} phone{phones.length !== 1 ? 's' : ''}
        </span>
      );
    
    case 'web_founded_year':
      if (!value) return <span className="text-muted-foreground">—</span>;
      return <span>{value as number}</span>;
    
    case 'web_headcount_estimate':
      if (!value) return <span className="text-muted-foreground">—</span>;
      return <span>~{value as number}</span>;
    
    case 'web_years_in_business':
      if (!value) return <span className="text-muted-foreground">—</span>;
      return <span>{value as number} yrs</span>;
    
    case 'web_team_count':
      if (!value) return <span className="text-muted-foreground">—</span>;
      return <span>{value as number}</span>;
    
    case 'web_contact_page':
    case 'web_social_facebook':
    case 'web_social_instagram':
    case 'web_social_linkedin':
      if (!value) return <span className="text-muted-foreground">—</span>;
      return (
        <a 
          href={value as string} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-primary hover:underline text-xs truncate max-w-[100px] block"
          onClick={(e) => e.stopPropagation()}
          title={value as string}
        >
          {new URL(value as string).hostname.replace('www.', '')}
        </a>
      );
    
    default:
      if (value === undefined || value === null || value === '') {
        return <span className="text-muted-foreground">—</span>;
      }
      return String(value);
  }
};

interface BusinessTableProps {
  businesses: Business[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onRowClick: (business: Business) => void;
}

export const BusinessTable: React.FC<BusinessTableProps> = ({
  businesses,
  isLoading,
  page,
  totalPages,
  onPageChange,
  sortBy,
  sortOrder,
  onSort,
  selectedIds,
  onSelectionChange,
  onRowClick,
}) => {
  const queryClient = useQueryClient();

  // Load visible columns from localStorage
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load column preferences:', e);
    }
    return ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);
  });

  // Save to localStorage when columns change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch (e) {
      console.error('Failed to save column preferences:', e);
    }
  }, [visibleColumns]);

  // Get visible column definitions
  const columns = useMemo(() => 
    ALL_COLUMNS.filter(c => visibleColumns.includes(c.key)),
    [visibleColumns]
  );

  // Group columns by category for the dropdown
  const columnsByCategory = useMemo(() => {
    const groups: Record<string, ColumnDef[]> = {};
    ALL_COLUMNS.forEach(col => {
      if (!groups[col.category]) groups[col.category] = [];
      groups[col.category].push(col);
    });
    return groups;
  }, []);

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const resetToDefaults = () => {
    setVisibleColumns(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
  };

  const showAllColumns = () => {
    setVisibleColumns(ALL_COLUMNS.map(c => c.key));
  };

  const hideAllColumns = () => {
    // Keep at least name and preview
    setVisibleColumns(['name', 'preview']);
  };

  const allSelected = businesses.length > 0 && businesses.every(b => selectedIds.includes(b.place_id));
  const someSelected = businesses.some(b => selectedIds.includes(b.place_id));

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange(selectedIds.filter(id => !businesses.find(b => b.place_id === id)));
    } else {
      const newIds = [...new Set([...selectedIds, ...businesses.map(b => b.place_id)])];
      onSelectionChange(newIds);
    }
  };

  const handleSelectOne = (placeId: string) => {
    if (selectedIds.includes(placeId)) {
      onSelectionChange(selectedIds.filter(id => id !== placeId));
    } else {
      onSelectionChange([...selectedIds, placeId]);
    }
  };

  const handleStepComplete = (business: Business, stepDoneKey: keyof Business) => {
    queryClient.setQueriesData<{ businesses: Business[]; total: number; page: number; totalPages: number }>(
      { queryKey: ['businesses'] },
      (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          businesses: oldData.businesses.map((b) =>
            b.place_id === business.place_id
              ? { ...b, [stepDoneKey]: true }
              : b
          ),
        };
      }
    );
  };

  if (isLoading && businesses.length === 0) {
    return (
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              {columns.map((col) => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (businesses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-lg font-medium text-foreground">No businesses found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try adjusting your search or filters
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Column visibility controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {columns.length} of {ALL_COLUMNS.length} columns
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 max-h-[400px] overflow-y-auto">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Toggle Columns</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={showAllColumns}>
                  <Eye className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={hideAllColumns}>
                  <EyeOff className="h-3 w-3" />
                </Button>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            {Object.entries(columnsByCategory).map(([category, cols]) => (
              <React.Fragment key={category}>
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  {CATEGORY_LABELS[category] || category}
                </DropdownMenuLabel>
                {cols.map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.key}
                    checked={visibleColumns.includes(col.key)}
                    onCheckedChange={() => toggleColumn(col.key)}
                  >
                    {col.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
              </React.Fragment>
            ))}
            
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-center text-xs"
              onClick={resetToDefaults}
            >
              Reset to Defaults
            </Button>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-12 sticky left-0 bg-muted/50 z-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all"
                  className={cn(someSelected && !allSelected && 'opacity-50')}
                />
              </TableHead>
              {columns.map((col) => (
                <TableHead key={col.key} className="whitespace-nowrap">
                  {col.sortable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSort(col.key)}
                      className="-ml-3 gap-1 font-medium"
                    >
                      {col.label}
                      <ArrowUpDown className={cn(
                        'h-4 w-4',
                        sortBy === col.key ? 'text-primary' : 'text-muted-foreground'
                      )} />
                    </Button>
                  ) : (
                    col.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {businesses.map((business) => (
              <TableRow
                key={business.place_id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button, [role="checkbox"], a')) return;
                  onRowClick(business);
                }}
              >
                <TableCell className="sticky left-0 bg-background z-10" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.includes(business.place_id)}
                    onCheckedChange={() => handleSelectOne(business.place_id)}
                    aria-label={`Select ${business.name}`}
                  />
                </TableCell>
                {columns.map((col) => (
                  <TableCell 
                    key={col.key}
                    onClick={(e) => {
                      if (col.key === 'pipeline' || col.key === 'preview' || col.key === 'website' || col.key === 'phone') {
                        e.stopPropagation();
                      }
                    }}
                  >
                    {formatCellValue(business, col, (stepDoneKey) => handleStepComplete(business, stepDoneKey))}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(1)}
            disabled={page === 1}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(totalPages)}
            disabled={page === totalPages}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
