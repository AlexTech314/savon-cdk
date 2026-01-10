import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { startJob } from '@/lib/api';
import { createTemplate } from '@/lib/templates';
import { JobConfig, JobTemplate, PlacesConfig, RuleGroup } from '@/types/jobs';
import { createEmptyRuleGroup } from '@/lib/ruleEngine';
import { PlacesConfigForm } from './PlacesConfigForm';
import { CopyConfigForm } from './CopyConfigForm';
import { JobConfigSummary } from './JobConfigSummary';
import { TemplateSelector } from './TemplateSelector';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  MapPin,
  Sparkles,
  Layers,
  ArrowLeft,
  ArrowRight,
  Play,
  Loader2,
  Check,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StartJobWizardProps {
  open: boolean;
  onClose: () => void;
  initialJobType?: 'places' | 'copy' | 'both';
  initialTemplate?: JobTemplate;
}

type WizardStep = 'type' | 'places' | 'copy' | 'review' | 'templates';

export const StartJobWizard: React.FC<StartJobWizardProps> = ({
  open,
  onClose,
  initialJobType,
  initialTemplate,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('type');
  const [jobType, setJobType] = useState<'places' | 'copy' | 'both'>('places');
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);

  // Config state
  const [placesConfig, setPlacesConfig] = useState<PlacesConfig>({
    searches: [{ textQuery: '', includedType: '' }],
    maxResultsPerSearch: 500,
    onlyWithoutWebsite: true,
  });
  const [copyRules, setCopyRules] = useState<RuleGroup>(createEmptyRuleGroup());
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Initialize from props
  useEffect(() => {
    if (initialJobType) {
      setJobType(initialJobType);
      setCurrentStep(initialJobType === 'places' ? 'places' : initialJobType === 'copy' ? 'copy' : 'places');
    }
    if (initialTemplate) {
      setJobType(initialTemplate.jobType);
      if (initialTemplate.placesConfig) {
        setPlacesConfig(initialTemplate.placesConfig);
      }
      if (initialTemplate.copyConfig) {
        setCopyRules(initialTemplate.copyConfig.rules);
      }
      setCurrentStep(initialTemplate.jobType === 'copy' ? 'copy' : 'places');
    }
  }, [initialJobType, initialTemplate, open]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setCurrentStep('type');
        setJobType('places');
        setPlacesConfig({
          searches: [{ textQuery: '', includedType: '' }],
          maxResultsPerSearch: 500,
          onlyWithoutWebsite: true,
        });
        setCopyRules(createEmptyRuleGroup());
        setSaveAsTemplate(false);
        setTemplateName('');
        setShowSuccess(false);
        setCreatedJobId(null);
      }, 300);
    }
  }, [open]);

  const startJobMutation = useMutation({
    mutationFn: startJob,
    onSuccess: async (job) => {
      setCreatedJobId(job.job_id);
      setShowSuccess(true);
      
      // Save template if requested
      if (saveAsTemplate && templateName) {
        await createTemplate({
          name: templateName,
          jobType,
          placesConfig: (jobType === 'places' || jobType === 'both') ? placesConfig : undefined,
          copyConfig: (jobType === 'copy' || jobType === 'both') ? { rules: copyRules } : undefined,
        });
        queryClient.invalidateQueries({ queryKey: ['templates'] });
      }

      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });

      setTimeout(() => {
        toast({
          title: 'Job Started',
          description: `Tracking ID: ${job.job_id}`,
        });
        onClose();
      }, 1500);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to start job.',
        variant: 'destructive',
      });
    },
  });

  const handleStartJob = () => {
    const config: JobConfig = {
      jobType,
      placesConfig: (jobType === 'places' || jobType === 'both') ? placesConfig : undefined,
      copyConfig: (jobType === 'copy' || jobType === 'both') ? { rules: copyRules } : undefined,
      templateName: saveAsTemplate ? templateName : undefined,
    };

    // Filter out empty searches
    const validSearches = placesConfig.searches.filter(s => s.textQuery.trim());

    startJobMutation.mutate({
      job_type: jobType,
      searches: validSearches,
      maxResultsPerSearch: placesConfig.maxResultsPerSearch,
      onlyWithoutWebsite: placesConfig.onlyWithoutWebsite,
    });
  };

  const handleTemplateSelect = (template: JobTemplate) => {
    setJobType(template.jobType);
    if (template.placesConfig) {
      setPlacesConfig(template.placesConfig);
    }
    if (template.copyConfig) {
      setCopyRules(template.copyConfig.rules);
    }
    setCurrentStep('review');
  };

  const handleRunTemplate = (template: JobTemplate) => {
    handleTemplateSelect(template);
    // Auto-start after a brief moment
    setTimeout(() => {
      handleStartJob();
    }, 100);
  };

  const getNextStep = (): WizardStep | null => {
    switch (currentStep) {
      case 'type':
        return jobType === 'copy' ? 'copy' : 'places';
      case 'places':
        return jobType === 'both' ? 'copy' : 'review';
      case 'copy':
        return 'review';
      case 'templates':
        return null;
      case 'review':
        return null;
      default:
        return null;
    }
  };

  const getPrevStep = (): WizardStep | null => {
    switch (currentStep) {
      case 'places':
        return 'type';
      case 'copy':
        return jobType === 'both' ? 'places' : 'type';
      case 'review':
        return jobType === 'copy' ? 'copy' : jobType === 'both' ? 'copy' : 'places';
      case 'templates':
        return 'type';
      default:
        return null;
    }
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'places':
        return placesConfig.searches.some(s => s.textQuery.trim().length > 0);
      case 'copy':
        return copyRules.rules.length > 0;
      default:
        return true;
    }
  };

  const steps = ['type', 'places', 'copy', 'review'].filter((step) => {
    if (step === 'places' && jobType === 'copy') return false;
    if (step === 'copy' && jobType === 'places') return false;
    return true;
  });

  const currentStepIndex = steps.indexOf(currentStep);

  if (showSuccess) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8">
            <div className="h-16 w-16 rounded-full bg-accent/20 flex items-center justify-center mb-4 animate-fade-in">
              <Check className="h-8 w-8 text-accent" />
            </div>
            <h3 className="text-lg font-semibold">Job Started Successfully!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Tracking ID: <code className="font-mono">{createdJobId}</code>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start New Job</DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        {currentStep !== 'templates' && (
          <div className="flex items-center gap-2 pb-4 border-b border-border">
            {steps.map((step, index) => (
              <React.Fragment key={step}>
                <div
                  className={cn(
                    'flex items-center justify-center h-8 w-8 rounded-full text-sm font-medium transition-colors',
                    index <= currentStepIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {index + 1}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-0.5 transition-colors',
                      index < currentStepIndex ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Step content */}
        <div className="py-4 min-h-[300px]">
          {currentStep === 'type' && (
            <div className="space-y-4">
              <div className="grid gap-3">
                <JobTypeCard
                  type="places"
                  selected={jobType === 'places'}
                  onClick={() => setJobType('places')}
                  icon={<MapPin className="h-5 w-5" />}
                  title="Google Places Search"
                  description="Search for new businesses from Google Places API"
                />
                <JobTypeCard
                  type="copy"
                  selected={jobType === 'copy'}
                  onClick={() => setJobType('copy')}
                  icon={<Sparkles className="h-5 w-5" />}
                  title="Generate LLM Copy"
                  description="Generate marketing copy for existing businesses"
                />
                <JobTypeCard
                  type="both"
                  selected={jobType === 'both'}
                  onClick={() => setJobType('both')}
                  icon={<Layers className="h-5 w-5" />}
                  title="Run Both"
                  description="Search for places, then generate previews"
                  extra={
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">Places</Badge>
                      <ArrowRight className="h-3 w-3" />
                      <Badge variant="outline" className="text-xs">Copy</Badge>
                    </div>
                  }
                />
              </div>

              <div className="border-t border-border pt-4">
                <Button
                  variant="ghost"
                  onClick={() => setCurrentStep('templates')}
                  className="w-full gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Use Saved Template
                </Button>
              </div>
            </div>
          )}

          {currentStep === 'templates' && (
            <TemplateSelector
              onSelect={handleTemplateSelect}
              onRunTemplate={handleRunTemplate}
            />
          )}

          {currentStep === 'places' && (
            <PlacesConfigForm
              config={placesConfig}
              onChange={setPlacesConfig}
              saveAsTemplate={saveAsTemplate}
              onSaveAsTemplateChange={setSaveAsTemplate}
              templateName={templateName}
              onTemplateNameChange={setTemplateName}
            />
          )}

          {currentStep === 'copy' && (
            <CopyConfigForm rules={copyRules} onChange={setCopyRules} />
          )}

          {currentStep === 'review' && (
            <JobConfigSummary
              config={{
                jobType,
                placesConfig: (jobType === 'places' || jobType === 'both') ? placesConfig : undefined,
                copyConfig: (jobType === 'copy' || jobType === 'both') ? { rules: copyRules } : undefined,
                templateName: saveAsTemplate ? templateName : undefined,
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={() => {
              const prev = getPrevStep();
              if (prev) setCurrentStep(prev);
              else onClose();
            }}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {getPrevStep() ? 'Back' : 'Cancel'}
          </Button>

          {currentStep === 'review' ? (
            <Button
              onClick={handleStartJob}
              disabled={startJobMutation.isPending}
              className="gap-2"
            >
              {startJobMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start Job
                </>
              )}
            </Button>
          ) : currentStep !== 'templates' ? (
            <Button
              onClick={() => {
                const next = getNextStep();
                if (next) setCurrentStep(next);
              }}
              disabled={!canProceed()}
              className="gap-2"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface JobTypeCardProps {
  type: 'places' | 'copy' | 'both';
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  extra?: React.ReactNode;
}

const JobTypeCard: React.FC<JobTypeCardProps> = ({
  selected,
  onClick,
  icon,
  title,
  description,
  extra,
}) => (
  <div
    onClick={onClick}
    className={cn(
      'flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all',
      selected
        ? 'border-primary bg-primary/5'
        : 'border-border hover:border-primary/50 hover:bg-muted/50'
    )}
  >
    <div
      className={cn(
        'p-2 rounded-lg',
        selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      )}
    >
      {icon}
    </div>
    <div className="flex-1">
      <h4 className="font-medium">{title}</h4>
      <p className="text-sm text-muted-foreground">{description}</p>
      {extra}
    </div>
    <div
      className={cn(
        'h-5 w-5 rounded-full border-2 flex items-center justify-center',
        selected ? 'border-primary bg-primary' : 'border-muted-foreground'
      )}
    >
      {selected && <Check className="h-3 w-3 text-primary-foreground" />}
    </div>
  </div>
);
