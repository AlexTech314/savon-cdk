import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Plus, X, AlertTriangle, DollarSign, Info } from 'lucide-react';
import { estimatePipelineCost, formatCost, PRICING } from '@/lib/pricing';

export interface FilterRule {
  field: string;
  operator: 'EXISTS' | 'NOT_EXISTS' | 'EQUALS' | 'NOT_EQUALS';
  value?: string;
}

interface GeneratePreviewsModalProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (mode: 'all' | 'filtered', rules: FilterRule[]) => void;
  totalBusinesses: number;
}

const FILTERABLE_FIELDS = [
  // Pipeline status fields
  { value: 'searched', label: 'Searched' },
  { value: 'details_fetched', label: 'Details Fetched' },
  { value: 'reviews_fetched', label: 'Reviews Fetched' },
  { value: 'photos_fetched', label: 'Photos Fetched' },
  { value: 'copy_generated', label: 'Copy Generated' },
  { value: 'has_website', label: 'Has Website' },
  // Business fields
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'business_type', label: 'Business Type' },
  { value: 'phone', label: 'Phone' },
  { value: 'rating', label: 'Rating' },
];

const OPERATORS = [
  { value: 'EXISTS', label: 'EXISTS', needsValue: false },
  { value: 'NOT_EXISTS', label: 'NOT EXISTS', needsValue: false },
  { value: 'EQUALS', label: 'EQUALS', needsValue: true },
  { value: 'NOT_EQUALS', label: 'NOT EQUALS', needsValue: true },
];

export const GeneratePreviewsModal: React.FC<GeneratePreviewsModalProps> = ({
  open,
  onClose,
  onGenerate,
  totalBusinesses,
}) => {
  const [mode, setMode] = useState<'all' | 'filtered'>('all');
  const [rules, setRules] = useState<FilterRule[]>([]);

  const addRule = () => {
    setRules([...rules, { field: 'copy_generated', operator: 'NOT_EXISTS' }]);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, updates: Partial<FilterRule>) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], ...updates };
    
    // Clear value if operator doesn't need it
    const operator = OPERATORS.find(o => o.value === (updates.operator || updated[index].operator));
    if (operator && !operator.needsValue) {
      updated[index].value = undefined;
    }
    
    setRules(updated);
  };

  const handleGenerate = () => {
    onGenerate(mode, mode === 'filtered' ? rules : []);
    onClose();
    // Reset state
    setMode('all');
    setRules([]);
  };

  const operatorNeedsValue = (operator: string) => {
    return OPERATORS.find(o => o.value === operator)?.needsValue ?? false;
  };

  const canGenerate = mode === 'all' || (mode === 'filtered' && rules.length > 0);

  // Calculate estimated cost
  const estimatedCount = mode === 'all' ? totalBusinesses : Math.min(totalBusinesses, 100); // Estimate for filtered
  const costEstimate = useMemo(() => estimatePipelineCost(estimatedCount), [estimatedCount]);
  const perBusinessCost = useMemo(() => estimatePipelineCost(1), []);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate Previews
          </DialogTitle>
          <DialogDescription>
            Run the full pipeline (details → reviews → copy) for businesses. Businesses with websites will be skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Mode selection */}
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as 'all' | 'filtered')}
            className="space-y-3"
          >
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="all" id="all" className="mt-1" />
              <div>
                <Label htmlFor="all" className="font-medium cursor-pointer">
                  All Businesses
                </Label>
                <p className="text-sm text-muted-foreground">
                  Generate previews for all {totalBusinesses.toLocaleString()} businesses
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="filtered" id="filtered" className="mt-1" />
              <div>
                <Label htmlFor="filtered" className="font-medium cursor-pointer">
                  With Filter Rules
                </Label>
                <p className="text-sm text-muted-foreground">
                  Only generate for businesses matching specific criteria
                </p>
              </div>
            </div>
          </RadioGroup>

          {/* Filter rules */}
          {mode === 'filtered' && (
            <div className="space-y-4 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Filter Rules (AND)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addRule}
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Add Rule
                </Button>
              </div>

              {rules.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No rules added. Click "Add Rule" to define filter criteria.
                </p>
              ) : (
                <div className="space-y-3">
                  {rules.map((rule, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30"
                    >
                      {/* Field */}
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

                      {/* Operator */}
                      <Select
                        value={rule.operator}
                        onValueChange={(v) => updateRule(index, { operator: v as FilterRule['operator'] })}
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

                      {/* Value (if needed) */}
                      {operatorNeedsValue(rule.operator) && (
                        <Input
                          placeholder="Value"
                          value={rule.value || ''}
                          onChange={(e) => updateRule(index, { value: e.target.value })}
                          className="flex-1"
                        />
                      )}

                      {/* Remove button */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRule(index)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {rules.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-xs">
                    All rules must match (AND logic)
                  </Badge>
                </div>
              )}
            </div>
          )}

          {/* Pipeline info */}
          <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/30">
            <Sparkles className="h-4 w-4 text-primary mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Full Pipeline</p>
              <p className="text-muted-foreground">
                For each business: Fetch details → Fetch reviews → Generate copy
              </p>
            </div>
          </div>

          {/* Cost estimate */}
          <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Estimated Cost</span>
            </div>
            <div className="space-y-1 text-sm">
              {mode === 'all' ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {totalBusinesses.toLocaleString()} businesses × {perBusinessCost.formatted}
                    </span>
                    <span className="font-mono font-medium">{costEstimate.formatted}</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t border-border/50">
                    {perBusinessCost.formattedBreakdown.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Per business</span>
                    <span className="font-mono font-medium">{perBusinessCost.formatted}</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t border-border/50">
                    {perBusinessCost.formattedBreakdown.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    Total cost depends on how many businesses match your filter rules.
                  </p>
                </>
              )}
            </div>
            <div className="flex items-start gap-1 mt-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Estimates based on Google API and Anthropic pricing. 
                See <a href="/settings/pricing" className="underline hover:text-primary">Pricing</a> for details.
              </span>
            </div>
          </div>

          {/* Warning for large batches */}
          {mode === 'all' && totalBusinesses > 100 && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-500">Large Batch Warning</p>
                <p className="text-muted-foreground">
                  Running pipeline for {totalBusinesses.toLocaleString()} businesses will take significant time and incur approximately {costEstimate.formatted} in API costs.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={!canGenerate}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Previews
            {mode === 'all' && (
              <span className="ml-1 text-xs opacity-75">({costEstimate.formatted})</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
