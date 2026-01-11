import React, { useState } from 'react';
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
import { Sparkles, Plus, X, AlertTriangle } from 'lucide-react';

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
  { value: 'email', label: 'Email' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'business_type', label: 'Business Type' },
  { value: 'phone', label: 'Phone' },
  { value: 'website', label: 'Website' },
  { value: 'rating', label: 'Rating' },
  { value: 'generated_copy', label: 'Generated Copy' },
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
    setRules([...rules, { field: 'email', operator: 'EXISTS' }]);
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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate Previews
          </DialogTitle>
          <DialogDescription>
            Generate AI previews for businesses. This may take a while for large batches.
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

          {/* Warning for large batches */}
          {mode === 'all' && totalBusinesses > 100 && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-500">Large Batch Warning</p>
                <p className="text-muted-foreground">
                  Generating previews for {totalBusinesses.toLocaleString()} businesses will take time and incur API costs.
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
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
