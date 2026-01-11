import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBusinessFilterOptions } from '@/lib/api';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BusinessFilters, PipelineStatus } from '@/lib/types';
import { Search, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BusinessFiltersComponentProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: BusinessFilters;
  onFiltersChange: (filters: BusinessFilters) => void;
}

const pipelineStatuses: { value: PipelineStatus; label: string }[] = [
  { value: 'searched', label: 'Searched (needs details)' },
  { value: 'details', label: 'Has Details (needs reviews)' },
  { value: 'reviews', label: 'Has Reviews (needs copy)' },
  { value: 'complete', label: 'Complete' },
  { value: 'has_website', label: 'Has Website' },
];

export const BusinessFiltersComponent: React.FC<BusinessFiltersComponentProps> = ({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
}) => {
  // Fetch available filter options from API
  const { data: filterOptions, isLoading } = useQuery({
    queryKey: ['businessFilterOptions'],
    queryFn: getBusinessFilterOptions,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const hasActiveFilters = search || filters.business_type || filters.state || filters.has_copy !== undefined || filters.pipeline_status;

  const clearFilters = () => {
    onSearchChange('');
    onFiltersChange({});
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, city, or address..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Business Type filter */}
      <Select
        value={filters.business_type || 'all'}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            business_type: value === 'all' ? undefined : value,
          })
        }
      >
        <SelectTrigger className="w-full sm:w-48">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : (
            <SelectValue placeholder="Business Type" />
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          {filterOptions?.businessTypes.map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* State filter */}
      <Select
        value={filters.state || 'all'}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            state: value === 'all' ? undefined : value,
          })
        }
      >
        <SelectTrigger className="w-full sm:w-32">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>...</span>
            </div>
          ) : (
            <SelectValue placeholder="State" />
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All States</SelectItem>
          {filterOptions?.states.map((state) => (
            <SelectItem key={state} value={state}>
              {state}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Pipeline Status filter */}
      <Select
        value={filters.pipeline_status || 'all'}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            pipeline_status: value === 'all' ? undefined : value as PipelineStatus,
          })
        }
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder="Pipeline Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Pipeline Status</SelectItem>
          {pipelineStatuses.map((status) => (
            <SelectItem key={status.value} value={status.value}>
              {status.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="gap-2"
        >
          <X className="h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
};
