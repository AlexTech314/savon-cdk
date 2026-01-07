import React from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BusinessFilters } from '@/lib/types';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BusinessFiltersComponentProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: BusinessFilters;
  onFiltersChange: (filters: BusinessFilters) => void;
}

const businessTypes = ['Plumber', 'HVAC Contractor', 'Electrician'];
const states = ['CA', 'TX', 'FL', 'NY', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI'];

export const BusinessFiltersComponent: React.FC<BusinessFiltersComponentProps> = ({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
}) => {
  const hasActiveFilters = search || filters.business_type || filters.state || filters.has_copy !== undefined;

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
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Business Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          {businessTypes.map((type) => (
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
          <SelectValue placeholder="State" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All States</SelectItem>
          {states.map((state) => (
            <SelectItem key={state} value={state}>
              {state}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Has Copy filter */}
      <Select
        value={
          filters.has_copy === undefined
            ? 'all'
            : filters.has_copy
            ? 'yes'
            : 'no'
        }
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            has_copy: value === 'all' ? undefined : value === 'yes',
          })
        }
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue placeholder="Has Copy" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="yes">Has Copy</SelectItem>
          <SelectItem value="no">Missing Copy</SelectItem>
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
