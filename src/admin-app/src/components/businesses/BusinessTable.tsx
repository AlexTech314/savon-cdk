import React, { useState } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
          toast({ title: 'Details Fetched', description: `Updated ${business.business_name}` });
          break;
        case 'reviews':
          await generateReviews(business.place_id);
          toast({ title: 'Reviews Fetched', description: `Updated ${business.business_name}` });
          break;
        case 'photos':
          await generatePhotos(business.place_id);
          toast({ title: 'Photos Fetched', description: `Updated ${business.business_name}` });
          break;
        case 'copy':
          await generateCopy(business.place_id);
          toast({ title: 'Copy Generated', description: `Updated ${business.business_name}` });
          break;
        default:
          toast({ title: 'Not Supported', description: 'This step cannot be run individually', variant: 'destructive' });
          return;
      }
      // Only update the specific step that was completed
      onStepComplete(stepDoneKey);
    } catch (error) {
      console.error(`Failed to run ${step}:`, error);
      toast({ 
        title: 'Error', 
        description: `Failed to run ${step} for ${business.business_name}`,
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

  const columns = [
    { key: 'name', label: 'Business Name', sortable: true },
    { key: 'business_type', label: 'Type', sortable: true },
    { key: 'city', label: 'City', sortable: true },
    { key: 'state', label: 'State', sortable: true },
    { key: 'pipeline', label: 'Pipeline', sortable: false },
    { key: 'preview', label: 'Preview', sortable: false },
  ];

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
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all"
                  className={cn(someSelected && !allSelected && 'opacity-50')}
                />
              </TableHead>
              {columns.map((col) => (
                <TableHead key={col.key}>
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
                  if ((e.target as HTMLElement).closest('button, [role="checkbox"]')) return;
                  onRowClick(business);
                }}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.includes(business.place_id)}
                    onCheckedChange={() => handleSelectOne(business.place_id)}
                    aria-label={`Select ${business.name}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{business.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{business.business_type}</Badge>
                </TableCell>
                <TableCell>{business.city}</TableCell>
                <TableCell>{business.state}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <PipelineStatus 
                    business={business} 
                    onStepComplete={(stepDoneKey) => {
                      // Update only the specific business in the cache
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
                    }}
                  />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <a 
                    href={`https://alpha.savondesigns.com/preview/${business.place_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Preview
                  </a>
                </TableCell>
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
