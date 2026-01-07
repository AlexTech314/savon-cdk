import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getBusinesses, deleteBusinesses, generateCopyBulk, exportBusinesses } from '@/lib/api';
import { Business, BusinessFilters } from '@/lib/types';
import { BusinessFiltersComponent } from '@/components/businesses/BusinessFilters';
import { BusinessTable } from '@/components/businesses/BusinessTable';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { ChevronDown, Download, FileText, Trash2 } from 'lucide-react';

const Businesses: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<BusinessFilters>({});
  const [sortBy, setSortBy] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const limit = 20;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['businesses', page, search, filters, sortBy, sortOrder],
    queryFn: () => getBusinesses({ page, limit, search, filters, sortBy, sortOrder }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBusinesses,
    onSuccess: (count) => {
      toast({
        title: 'Deleted',
        description: `${count} business(es) deleted successfully.`,
      });
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete businesses.',
        variant: 'destructive',
      });
    },
  });

  const generateCopyMutation = useMutation({
    mutationFn: generateCopyBulk,
    onSuccess: (count) => {
      toast({
        title: 'Copy Generated',
        description: `Generated copy for ${count} business(es).`,
      });
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to generate copy.',
        variant: 'destructive',
      });
    },
  });

  const handleSort = useCallback((column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  }, [sortBy, sortOrder]);

  const handleRowClick = useCallback((business: Business) => {
    navigate(`/businesses/${business.place_id}`);
  }, [navigate]);

  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedIds(ids);
  }, []);

  const handleExport = async (filtered: boolean) => {
    try {
      const csv = await exportBusinesses(filtered ? filters : undefined);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `businesses_export_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: 'Export Complete',
        description: 'CSV file downloaded successfully.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to export businesses.',
        variant: 'destructive',
      });
    }
  };

  const handleBulkDelete = () => {
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate(selectedIds);
    setDeleteDialogOpen(false);
  };

  const handleBulkGenerateCopy = () => {
    generateCopyMutation.mutate(selectedIds);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Businesses</h1>
          <p className="text-muted-foreground">
            {data?.total ?? 0} total businesses
          </p>
        </div>

        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport(false)}>
                Export All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport(true)}>
                Export Filtered
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filters */}
      <BusinessFiltersComponent
        search={search}
        onSearchChange={setSearch}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-4 rounded-lg border border-primary/50 bg-primary/10 p-4">
          <span className="text-sm font-medium">
            {selectedIds.length} selected
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary" className="gap-2">
                Bulk Actions
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleBulkGenerateCopy}>
                <FileText className="mr-2 h-4 w-4" />
                Generate Copy for Selected
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport(false)}>
                <Download className="mr-2 h-4 w-4" />
                Export Selected
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleBulkDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds([])}
          >
            Clear selection
          </Button>
        </div>
      )}

      {/* Table */}
      <BusinessTable
        businesses={data?.data ?? []}
        isLoading={isLoading || isFetching}
        page={page}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        onRowClick={handleRowClick}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Businesses</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.length} business(es)?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Businesses;
