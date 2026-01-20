import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Download,
  Search,
  Check,
  X,
  Loader2,
  Plus,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { getBusinessColumns, exportBusinesses, PipelineFilterRule } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ExportWizardProps {
  open: boolean;
  onClose: () => void;
}

// Common column groups for quick selection
const COLUMN_GROUPS = {
  basic: {
    label: 'Basic Info',
    columns: ['place_id', 'business_name', 'business_type', 'address', 'city', 'state', 'zip_code', 'phone'],
  },
  contact: {
    label: 'Contact',
    columns: ['phone', 'website_uri', 'email'],
  },
  ratings: {
    label: 'Ratings',
    columns: ['rating', 'rating_count', 'reviews'],
  },
  pipeline: {
    label: 'Pipeline Status',
    columns: ['searched', 'details_fetched', 'reviews_fetched', 'photos_fetched', 'copy_generated', 'has_website'],
  },
  timestamps: {
    label: 'Timestamps',
    columns: ['created_at', 'updated_at'],
  },
};

// Human-readable column labels
const COLUMN_LABELS: Record<string, string> = {
  place_id: 'Place ID',
  business_name: 'Business Name',
  business_type: 'Business Type',
  address: 'Address',
  city: 'City',
  state: 'State',
  zip_code: 'ZIP Code',
  phone: 'Phone',
  website_uri: 'Website URL',
  rating: 'Rating',
  rating_count: 'Review Count',
  reviews: 'Reviews (JSON)',
  editorial_summary: 'Editorial Summary',
  hours: 'Business Hours',
  searched: 'Searched',
  details_fetched: 'Details Fetched',
  reviews_fetched: 'Reviews Fetched',
  photos_fetched: 'Photos Fetched',
  copy_generated: 'Copy Generated',
  has_website: 'Has Website',
  created_at: 'Created At',
  updated_at: 'Updated At',
  friendly_slug: 'Friendly Slug',
  latitude: 'Latitude',
  longitude: 'Longitude',
};

const FILTERABLE_FIELDS = [
  { value: 'state', label: 'State' },
  { value: 'city', label: 'City' },
  { value: 'business_type', label: 'Business Type' },
  { value: 'searched', label: 'Searched' },
  { value: 'details_fetched', label: 'Details Fetched' },
  { value: 'reviews_fetched', label: 'Reviews Fetched' },
  { value: 'photos_fetched', label: 'Photos Fetched' },
  { value: 'copy_generated', label: 'Copy Generated' },
  { value: 'has_website', label: 'Has Website' },
];

const OPERATORS = [
  { value: 'EXISTS', label: 'EXISTS', needsValue: false },
  { value: 'NOT_EXISTS', label: 'NOT EXISTS', needsValue: false },
  { value: 'EQUALS', label: 'EQUALS', needsValue: true },
  { value: 'NOT_EQUALS', label: 'NOT EQUALS', needsValue: true },
];

export function ExportWizard({ open, onClose }: ExportWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [filterRules, setFilterRules] = useState<PipelineFilterRule[]>([]);

  // Fetch available columns
  const { data: columnsData, isLoading: isLoadingColumns } = useQuery({
    queryKey: ['businessColumns'],
    queryFn: getBusinessColumns,
    enabled: open,
    staleTime: 60000, // Cache for 1 minute
  });

  const availableColumns = columnsData?.columns || [];

  // Filter rule management
  const addRule = () => {
    setFilterRules([...filterRules, { field: 'state', operator: 'EQUALS', value: '' }]);
  };

  const removeRule = (index: number) => {
    setFilterRules(filterRules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, updates: Partial<PipelineFilterRule>) => {
    const updated = [...filterRules];
    updated[index] = { ...updated[index], ...updates };
    
    const operator = OPERATORS.find(o => o.value === (updates.operator || updated[index].operator));
    if (operator && !operator.needsValue) {
      updated[index].value = undefined;
    }
    
    setFilterRules(updated);
  };

  const operatorNeedsValue = (operator: string) => {
    return OPERATORS.find(o => o.value === operator)?.needsValue ?? false;
  };

  // Step navigation
  const nextStep = () => setStep(s => Math.min(s + 1, 2));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  // Filter columns by search
  const filteredColumns = useMemo(() => {
    if (!searchQuery.trim()) return availableColumns;
    const query = searchQuery.toLowerCase();
    return availableColumns.filter(col => 
      col.toLowerCase().includes(query) ||
      (COLUMN_LABELS[col]?.toLowerCase().includes(query))
    );
  }, [availableColumns, searchQuery]);

  // Toggle column selection
  const toggleColumn = (column: string) => {
    const newSelected = new Set(selectedColumns);
    if (newSelected.has(column)) {
      newSelected.delete(column);
    } else {
      newSelected.add(column);
    }
    setSelectedColumns(newSelected);
  };

  // Select all / deselect all
  const selectAll = () => {
    setSelectedColumns(new Set(availableColumns));
  };

  const deselectAll = () => {
    setSelectedColumns(new Set());
  };

  // Select a group
  const selectGroup = (groupKey: keyof typeof COLUMN_GROUPS) => {
    const group = COLUMN_GROUPS[groupKey];
    const newSelected = new Set(selectedColumns);
    group.columns.forEach(col => {
      if (availableColumns.includes(col)) {
        newSelected.add(col);
      }
    });
    setSelectedColumns(newSelected);
  };

  // Handle export
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const columnsToExport = selectedColumns.size > 0 
        ? Array.from(selectedColumns)
        : undefined; // undefined = export all
      
      const result = await exportBusinesses(
        columnsToExport,
        filterRules.length > 0 ? filterRules : undefined
      );
      
      if (!result.downloadUrl) {
        toast({
          title: 'No Data',
          description: result.message || 'No items match the filter criteria.',
          variant: 'destructive',
        });
        return;
      }
      
      // Download from the signed URL
      const a = document.createElement('a');
      a.href = result.downloadUrl;
      a.download = `businesses_export_${Date.now()}.csv`;
      a.click();
      
      const sizeMB = result.sizeBytes ? (result.sizeBytes / 1024 / 1024).toFixed(2) : 'unknown';
      toast({
        title: 'Export Complete',
        description: `Exported ${result.itemCount?.toLocaleString() || 'unknown'} items (${sizeMB} MB).`,
      });
      
      handleClose();
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: 'Export Failed',
        description: 'There was an error exporting the data. The request may have timed out for large datasets.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Reset state when dialog closes
  const handleClose = () => {
    setStep(1);
    setSearchQuery('');
    setFilterRules([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Export Businesses
          </DialogTitle>
          <DialogDescription>
            {step === 1 ? 'Filter which businesses to export (optional)' : 'Select which columns to include'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  step === s
                    ? 'bg-primary text-primary-foreground'
                    : step > s
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {s === 1 ? <Filter className="h-4 w-4" /> : s}
              </div>
              {s < 2 && (
                <div
                  className={cn(
                    'h-0.5 w-8',
                    step > s ? 'bg-primary/50' : 'bg-muted'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-4">
          {/* Step 1: Filters */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label className="text-base">Filter Rules (Optional)</Label>
                <p className="text-sm text-muted-foreground">
                  Only export businesses matching ALL rules
                </p>
              </div>

              {filterRules.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-border rounded-lg">
                  <p className="text-sm text-muted-foreground mb-3">
                    No filter rules. All businesses will be exported.
                  </p>
                  <Button variant="outline" size="sm" onClick={addRule}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Filter
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filterRules.map((rule, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30"
                    >
                      <Select
                        value={rule.field}
                        onValueChange={(v) => updateRule(index, { field: v })}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FILTERABLE_FIELDS.map((field) => (
                            <SelectItem key={field.value} value={field.value}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={rule.operator}
                        onValueChange={(v) => updateRule(index, { operator: v as PipelineFilterRule['operator'] })}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPERATORS.map((op) => (
                            <SelectItem key={op.value} value={op.value}>
                              {op.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {operatorNeedsValue(rule.operator) && (
                        <Input
                          placeholder="Value"
                          value={rule.value || ''}
                          onChange={(e) => updateRule(index, { value: e.target.value })}
                          className="flex-1"
                        />
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRule(index)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  <Button variant="outline" size="sm" onClick={addRule}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Filter
                  </Button>

                  {filterRules.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      All rules must match (AND logic)
                    </Badge>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Columns */}
          {step === 2 && (
            <>
              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  <Check className="h-3 w-3 mr-1" />
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
                <div className="h-6 w-px bg-border mx-1" />
                {Object.entries(COLUMN_GROUPS).map(([key, group]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    onClick={() => selectGroup(key as keyof typeof COLUMN_GROUPS)}
                  >
                    {group.label}
                  </Button>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search columns..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Selection summary */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {isLoadingColumns ? (
                    <Skeleton className="h-4 w-32" />
                  ) : (
                    <>
                      {selectedColumns.size} of {availableColumns.length} columns selected
                    </>
                  )}
                </span>
                {selectedColumns.size === 0 && (
                  <Badge variant="secondary">Will export all columns</Badge>
                )}
              </div>

              {/* Column List */}
              <ScrollArea className="h-[300px] border rounded-lg">
                {isLoadingColumns ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {filteredColumns.map((column) => {
                      const isSelected = selectedColumns.has(column);
                      const label = COLUMN_LABELS[column] || column;
                      
                      return (
                        <div
                          key={column}
                          className={cn(
                            'flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors',
                            isSelected 
                              ? 'bg-primary/10 hover:bg-primary/15' 
                              : 'hover:bg-muted'
                          )}
                          onClick={() => toggleColumn(column)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleColumn(column)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{label}</p>
                            {label !== column && (
                              <p className="text-xs text-muted-foreground font-mono truncate">
                                {column}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    
                    {filteredColumns.length === 0 && (
                      <div className="col-span-2 p-8 text-center text-muted-foreground">
                        No columns match your search
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>

              {/* Selected columns preview */}
              {selectedColumns.size > 0 && selectedColumns.size <= 8 && (
                <div className="flex flex-wrap gap-1">
                  {Array.from(selectedColumns).slice(0, 8).map((col) => (
                    <Badge
                      key={col}
                      variant="secondary"
                      className="cursor-pointer hover:bg-destructive/20"
                      onClick={() => toggleColumn(col)}
                    >
                      {COLUMN_LABELS[col] || col}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                  {selectedColumns.size > 8 && (
                    <Badge variant="outline">+{selectedColumns.size - 8} more</Badge>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={prevStep} disabled={isExporting}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          
          <div className="flex-1" />
          
          <Button variant="outline" onClick={handleClose} disabled={isExporting}>
            Cancel
          </Button>
          
          {step < 2 ? (
            <Button onClick={nextStep}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleExport} disabled={isExporting || isLoadingColumns}>
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export {selectedColumns.size > 0 ? `${selectedColumns.size} Columns` : 'All Columns'}
                  {filterRules.length > 0 && ` (${filterRules.length} filter${filterRules.length > 1 ? 's' : ''})`}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
