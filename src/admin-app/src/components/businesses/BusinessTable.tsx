import React, { useState } from 'react';
import { Business } from '@/lib/types';
import { generateCopy } from '@/lib/api';
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
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  Check,
  X,
  Loader2,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingStatus, setGeneratingStatus] = useState<string>('');

  const allSelected = businesses.length > 0 && businesses.every(b => selectedIds.includes(b.place_id));
  const someSelected = businesses.some(b => selectedIds.includes(b.place_id));

  const handleGeneratePreview = async (business: Business) => {
    setGeneratingId(business.place_id);
    setGeneratingStatus('Generating preview with AI...');
    
    try {
      await generateCopy(business.place_id);
      setGeneratingStatus('Preview generated!');
      
      toast({
        title: 'Preview Generated',
        description: `Preview created for "${business.name}"`,
      });
      
      // Refresh the businesses list
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      
      // Keep success message briefly visible
      setTimeout(() => {
        setGeneratingId(null);
        setGeneratingStatus('');
      }, 1500);
    } catch (error) {
      console.error('Failed to generate preview:', error);
      setGeneratingStatus('Failed to generate');
      
      toast({
        title: 'Error',
        description: 'Failed to generate preview. Please try again.',
        variant: 'destructive',
      });
      
      setTimeout(() => {
        setGeneratingId(null);
        setGeneratingStatus('');
      }, 2000);
    }
  };

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
    { key: 'phone', label: 'Phone', sortable: false },
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
                <TableCell className="text-muted-foreground">{business.phone}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {generatingId === business.place_id ? (
                    <div className="flex items-center gap-2 text-sm">
                      {generatingStatus.includes('Generated') || generatingStatus.includes('created') ? (
                        <Check className="h-4 w-4 text-accent" />
                      ) : generatingStatus.includes('Failed') ? (
                        <X className="h-4 w-4 text-destructive" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                      <span className={cn(
                        'text-xs',
                        generatingStatus.includes('Generated') && 'text-accent',
                        generatingStatus.includes('Failed') && 'text-destructive',
                        !generatingStatus.includes('Generated') && !generatingStatus.includes('Failed') && 'text-muted-foreground'
                      )}>
                        {generatingStatus}
                      </span>
                    </div>
                  ) : business.generated_copy ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 h-7 text-xs"
                      onClick={() => window.open(`https://alpha.savondesigns.com/preview/${business.place_id}`, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                      View
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 h-7 text-xs"
                      onClick={() => handleGeneratePreview(business)}
                      disabled={generatingId !== null}
                    >
                      <Sparkles className="h-3 w-3" />
                      Generate
                    </Button>
                  )}
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
