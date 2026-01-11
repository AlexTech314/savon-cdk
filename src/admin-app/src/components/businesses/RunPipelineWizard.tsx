import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Play, 
  Plus, 
  X, 
  ChevronLeft, 
  ChevronRight,
  DollarSign,
  Info,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { 
  startPipelineJob, 
  PipelineFilterRule,
  countBusinesses,
} from '@/lib/api';
import {
  formatCost,
  PRICING,
} from '@/lib/pricing';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface RunPipelineWizardProps {
  open: boolean;
  onClose: () => void;
  totalBusinesses: number;
}

const PIPELINE_STEPS = [
  { 
    id: 'details', 
    label: 'Details', 
    description: 'Fetch address, phone, hours, rating from Google',
    unitCost: PRICING.google.placeDetails,
    provider: 'Google Places API',
    requires: [],
  },
  { 
    id: 'enrich', 
    label: 'Reviews', 
    description: 'Fetch reviews and editorial summary from Google',
    unitCost: PRICING.google.placeDetailsReviews,
    provider: 'Google Places API',
    requires: ['details'],
  },
  { 
    id: 'photos', 
    label: 'Photos', 
    description: 'Fetch photo URLs from Google',
    unitCost: PRICING.google.photos,
    provider: 'Google Places API',
    requires: ['details'],
  },
  { 
    id: 'copy', 
    label: 'Copy', 
    description: 'Generate LLM marketing copy with Claude',
    unitCost: (PRICING.claude.avgInputTokens * PRICING.claude.inputPerToken) + 
              (PRICING.claude.avgOutputTokens * PRICING.claude.outputPerToken),
    provider: 'Anthropic Claude',
    requires: ['details', 'enrich'],
  },
] as const;

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

export const RunPipelineWizard: React.FC<RunPipelineWizardProps> = ({
  open,
  onClose,
  totalBusinesses,
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Step 1: Pipeline steps selection
  const [selectedSteps, setSelectedSteps] = useState<Set<string>>(new Set());
  
  // Step 2: Filter rules
  const [filterRules, setFilterRules] = useState<PipelineFilterRule[]>([]);
  
  // Step 3: Options
  const [skipWithWebsite, setSkipWithWebsite] = useState(true);

  // Toggle a pipeline step
  const toggleStep = (stepId: string) => {
    const newSelected = new Set(selectedSteps);
    if (newSelected.has(stepId)) {
      newSelected.delete(stepId);
    } else {
      newSelected.add(stepId);
      // Auto-select dependencies
      const stepInfo = PIPELINE_STEPS.find(s => s.id === stepId);
      stepInfo?.requires.forEach(dep => newSelected.add(dep));
    }
    setSelectedSteps(newSelected);
  };

  // Check if step can be deselected (no dependents selected)
  const canDeselect = (stepId: string) => {
    return !PIPELINE_STEPS.some(s => 
      s.requires.includes(stepId) && selectedSteps.has(s.id)
    );
  };

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
    
    // Clear value if operator doesn't need it
    const operator = OPERATORS.find(o => o.value === (updates.operator || updated[index].operator));
    if (operator && !operator.needsValue) {
      updated[index].value = undefined;
    }
    
    setFilterRules(updated);
  };

  const operatorNeedsValue = (operator: string) => {
    return OPERATORS.find(o => o.value === operator)?.needsValue ?? false;
  };

  // Query to get accurate count based on filter rules
  const { data: countData, isLoading: isCountLoading, refetch: refetchCount } = useQuery({
    queryKey: [
      'businessCount',
      Array.from(selectedSteps),
      filterRules,
      skipWithWebsite,
    ],
    queryFn: () => countBusinesses({
      filterRules: filterRules.length > 0 ? filterRules : undefined,
      skipWithWebsite,
      runDetails: selectedSteps.has('details'),
      runEnrich: selectedSteps.has('enrich'),
      runPhotos: selectedSteps.has('photos'),
      runCopy: selectedSteps.has('copy'),
    }),
    enabled: open && selectedSteps.size > 0,
    staleTime: 10000, // Cache for 10 seconds
  });

  // Cost estimation using actual counts from API
  const estimatedCost = useMemo(() => {
    const stepCounts = countData?.stepCounts || {
      total: totalBusinesses,
      details: totalBusinesses,
      reviews: totalBusinesses,
      photos: totalBusinesses,
      copy: totalBusinesses,
    };
    
    const runDetails = selectedSteps.has('details');
    const runEnrich = selectedSteps.has('enrich');
    const runPhotos = selectedSteps.has('photos');
    const runCopy = selectedSteps.has('copy');
    
    // Calculate costs per step based on actual counts
    const detailsUnitCost = PRICING.google.placeDetails;
    const reviewsUnitCost = PRICING.google.placeDetailsReviews;
    const photosUnitCost = PRICING.google.photos;
    const copyInputCost = PRICING.claude.avgInputTokens * PRICING.claude.inputPerToken;
    const copyOutputCost = PRICING.claude.avgOutputTokens * PRICING.claude.outputPerToken;
    const copyUnitCost = copyInputCost + copyOutputCost;
    
    const detailsCost = runDetails ? stepCounts.details * detailsUnitCost : 0;
    const reviewsCost = runEnrich ? stepCounts.reviews * reviewsUnitCost : 0;
    const photosCost = runPhotos ? stepCounts.photos * photosUnitCost : 0;
    const copyCost = runCopy ? stepCounts.copy * copyUnitCost : 0;
    
    const totalCost = detailsCost + reviewsCost + photosCost + copyCost;
    const businessCount = countData?.count || totalBusinesses;
    const perBusinessCost = businessCount > 0 ? totalCost / businessCount : 0;
    
    // Build step breakdown for display
    const stepBreakdown = [
      {
        step: 'Details',
        enabled: runDetails,
        count: stepCounts.details,
        unitCost: detailsUnitCost,
        totalCost: detailsCost,
        unitCostFormatted: formatCost(detailsUnitCost),
        totalCostFormatted: formatCost(detailsCost),
        apiProvider: 'Google Places API',
      },
      {
        step: 'Reviews',
        enabled: runEnrich,
        count: stepCounts.reviews,
        unitCost: reviewsUnitCost,
        totalCost: reviewsCost,
        unitCostFormatted: formatCost(reviewsUnitCost),
        totalCostFormatted: formatCost(reviewsCost),
        apiProvider: 'Google Places API',
      },
      {
        step: 'Photos',
        enabled: runPhotos,
        count: stepCounts.photos,
        unitCost: photosUnitCost,
        totalCost: photosCost,
        unitCostFormatted: formatCost(photosUnitCost),
        totalCostFormatted: formatCost(photosCost),
        apiProvider: 'Google Places API',
      },
      {
        step: 'Copy',
        enabled: runCopy,
        count: stepCounts.copy,
        unitCost: copyUnitCost,
        totalCost: copyCost,
        unitCostFormatted: formatCost(copyUnitCost),
        totalCostFormatted: formatCost(copyCost),
        apiProvider: 'Anthropic Claude',
      },
    ];
    
    // Generate warnings
    const warnings: string[] = [];
    if (businessCount > 1000) {
      warnings.push(`Large job: ${businessCount.toLocaleString()} businesses will be processed`);
    }
    if (totalCost > 50) {
      warnings.push(`Estimated cost exceeds $50`);
    }
    if (totalCost > 100) {
      warnings.push(`High cost alert: Consider running in smaller batches`);
    }
    
    return {
      total: totalCost,
      formatted: formatCost(totalCost),
      businessCount,
      perBusinessCost,
      perBusinessFormatted: formatCost(perBusinessCost),
      stepBreakdown,
      warnings,
      totalInDatabase: countData?.totalInDatabase || totalBusinesses,
      isLoading: isCountLoading,
    };
  }, [countData, selectedSteps, totalBusinesses, isCountLoading]);

  // Can proceed validation
  const canProceedStep1 = selectedSteps.size > 0;
  const canProceedStep2 = true; // Filter rules are optional
  const canProceedStep3 = true;
  const canSubmit = selectedSteps.size > 0;

  // Submit the job
  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      const job = await startPipelineJob({
        runDetails: selectedSteps.has('details'),
        runEnrich: selectedSteps.has('enrich'),
        runPhotos: selectedSteps.has('photos'),
        runCopy: selectedSteps.has('copy'),
        skipWithWebsite,
        filterRules: filterRules.length > 0 ? filterRules : undefined,
      });
      
      toast({
        title: 'Pipeline Job Started',
        description: `Job ${job.job_id.slice(0, 8)}... is now running. View progress on the Jobs page.`,
      });
      
      // Reset and close
      handleClose();
      
      // Navigate to jobs page
      navigate('/jobs');
    } catch (error) {
      console.error('Failed to start pipeline job:', error);
      toast({
        title: 'Error',
        description: 'Failed to start pipeline job. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset state and close
  const handleClose = () => {
    setStep(1);
    setSelectedSteps(new Set());
    setFilterRules([]);
    setSkipWithWebsite(true);
    onClose();
  };

  // Step navigation
  const nextStep = () => setStep(s => Math.min(s + 1, 4));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Run Pipeline
          </DialogTitle>
          <DialogDescription>
            Process existing businesses through selected pipeline steps.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          {[1, 2, 3, 4].map((s) => (
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
                {s}
              </div>
              {s < 4 && (
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

        <div className="py-4 min-h-[300px]">
          {/* Step 1: Select Pipeline Steps */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label className="text-base">Select Pipeline Steps</Label>
                <p className="text-sm text-muted-foreground">
                  Choose which processing steps to run
                </p>
              </div>
              
              <div className="space-y-3">
                {PIPELINE_STEPS.map((pipelineStep) => {
                  const isSelected = selectedSteps.has(pipelineStep.id);
                  const isRequired = pipelineStep.requires.some(dep => 
                    selectedSteps.has(dep) === false && 
                    PIPELINE_STEPS.some(s => s.id === dep && selectedSteps.has(s.id))
                  );
                  const canToggle = isSelected ? canDeselect(pipelineStep.id) : true;
                  
                  return (
                    <div
                      key={pipelineStep.id}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                        isSelected 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border bg-muted/30',
                        !canToggle && 'opacity-50'
                      )}
                    >
                      <Checkbox
                        id={pipelineStep.id}
                        checked={isSelected}
                        onCheckedChange={() => toggleStep(pipelineStep.id)}
                        disabled={!canToggle}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <Label 
                            htmlFor={pipelineStep.id}
                            className="font-medium cursor-pointer"
                          >
                            {pipelineStep.label}
                          </Label>
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {formatCost(pipelineStep.unitCost)}/business
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {pipelineStep.description}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          via {pipelineStep.provider}
                          {pipelineStep.requires.length > 0 && (
                            <> • Requires: {pipelineStep.requires.map(r => 
                              PIPELINE_STEPS.find(s => s.id === r)?.label
                            ).join(', ')}</>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Filter Rules */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label className="text-base">Filter Rules (Optional)</Label>
                <p className="text-sm text-muted-foreground">
                  Only process businesses matching ALL rules
                </p>
              </div>

              {filterRules.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-border rounded-lg">
                  <p className="text-sm text-muted-foreground mb-3">
                    No filter rules. All eligible businesses will be processed.
                  </p>
                  <Button variant="outline" size="sm" onClick={addRule}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Rule
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
                    Add Rule
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

          {/* Step 3: Options */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <Label className="text-base">Options</Label>
                <p className="text-sm text-muted-foreground">
                  Configure pipeline behavior
                </p>
              </div>

              <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="skip-website">Skip businesses with websites</Label>
                    <p className="text-sm text-muted-foreground">
                      Exclude businesses that already have a website
                    </p>
                  </div>
                  <Switch
                    id="skip-website"
                    checked={skipWithWebsite}
                    onCheckedChange={setSkipWithWebsite}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <Label className="text-base">Confirm Pipeline Job</Label>
                <p className="text-sm text-muted-foreground">
                  Review your selections before starting
                </p>
              </div>

              {/* Summary */}
              <div className="space-y-3">
                {/* Steps */}
                <div className="p-3 rounded-lg border border-border bg-muted/30">
                  <p className="text-sm font-medium mb-2">Pipeline Steps:</p>
                  <div className="flex flex-wrap gap-1">
                    {PIPELINE_STEPS.filter(s => selectedSteps.has(s.id)).map(s => (
                      <Badge key={s.id} variant="secondary">{s.label}</Badge>
                    ))}
                  </div>
                </div>

                {/* Filters */}
                {filterRules.length > 0 && (
                  <div className="p-3 rounded-lg border border-border bg-muted/30">
                    <p className="text-sm font-medium mb-2">Filter Rules:</p>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {filterRules.map((rule, i) => (
                        <div key={i}>
                          {rule.field} {rule.operator} {rule.value || ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Options */}
                <div className="p-3 rounded-lg border border-border bg-muted/30">
                  <p className="text-sm font-medium mb-2">Options:</p>
                  <p className="text-sm text-muted-foreground">
                    Skip businesses with websites: {skipWithWebsite ? 'Yes' : 'No'}
                  </p>
                </div>

                {/* Cost estimate - comprehensive breakdown */}
                <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Estimated Cost</span>
                      {estimatedCost.isLoading && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {estimatedCost.isLoading ? (
                      <Skeleton className="h-7 w-16" />
                    ) : (
                      <span className="text-lg font-bold text-primary">
                        {estimatedCost.formatted}
                      </span>
                    )}
                  </div>
                  
                  {/* Business count */}
                  <div className="text-sm mb-3 pb-2 border-b border-border/50">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Businesses matching filters:</span>
                      {estimatedCost.isLoading ? (
                        <Skeleton className="h-4 w-12" />
                      ) : (
                        <span className="font-mono">{estimatedCost.businessCount.toLocaleString()}</span>
                      )}
                    </div>
                    <div className="flex justify-between text-muted-foreground text-xs">
                      <span>Total in database:</span>
                      <span className="font-mono text-muted-foreground/70">{estimatedCost.totalInDatabase.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  {/* Step-by-step breakdown with per-step counts */}
                  <div className="space-y-1.5 text-xs">
                    {estimatedCost.stepBreakdown.filter(s => s.enabled).map((stepInfo) => (
                      <div key={stepInfo.step} className="flex justify-between items-center">
                        <div className="text-muted-foreground">
                          <span className="font-medium text-foreground">{stepInfo.step}</span>
                          <span className="text-[10px] ml-1">
                            ({stepInfo.unitCostFormatted} × {stepInfo.count.toLocaleString()} need{stepInfo.count === 1 ? 's' : ''} processing)
                          </span>
                        </div>
                        {estimatedCost.isLoading ? (
                          <Skeleton className="h-3 w-10" />
                        ) : (
                          <span className="font-mono">{stepInfo.totalCostFormatted}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {/* Warnings */}
                  {estimatedCost.warnings.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-border/50 space-y-1">
                      {estimatedCost.warnings.map((warning, i) => (
                        <div key={i} className="flex items-start gap-1 text-[10px] text-yellow-600 dark:text-yellow-400">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex items-start gap-1 mt-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>Actual cost depends on businesses matching your filters. Businesses that have already completed a step will be skipped.</span>
                  </div>
                </div>

                {/* Warning for no filters */}
                {filterRules.length === 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-600 dark:text-yellow-400">No filters set</p>
                      <p className="text-muted-foreground">
                        This will process all eligible businesses in your database.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={prevStep} disabled={isSubmitting}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          
          <div className="flex-1" />
          
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          
          {step < 4 ? (
            <Button
              onClick={nextStep}
              disabled={
                (step === 1 && !canProceedStep1) ||
                (step === 2 && !canProceedStep2) ||
                (step === 3 && !canProceedStep3)
              }
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? (
                <>Starting...</>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Start Pipeline
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
