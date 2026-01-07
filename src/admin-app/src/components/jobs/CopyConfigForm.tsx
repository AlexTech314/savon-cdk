import React from 'react';
import { RuleGroup } from '@/types/jobs';
import { RuleBuilder } from './RuleBuilder';
import { createEmptyRuleGroup } from '@/lib/ruleEngine';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CopyConfigFormProps {
  rules: RuleGroup;
  onChange: (rules: RuleGroup) => void;
}

export const CopyConfigForm: React.FC<CopyConfigFormProps> = ({
  rules,
  onChange,
}) => {
  const handleUsePreset = (preset: 'missing_copy' | 'high_rating' | 'no_website') => {
    const presets: Record<string, RuleGroup> = {
      missing_copy: {
        id: crypto.randomUUID(),
        logic: 'AND',
        rules: [
          { id: crypto.randomUUID(), field: 'has_generated_copy', operator: 'is_null' },
        ],
      },
      high_rating: {
        id: crypto.randomUUID(),
        logic: 'AND',
        rules: [
          { id: crypto.randomUUID(), field: 'rating', operator: 'greater_than', value: 4 },
          { id: crypto.randomUUID(), field: 'has_generated_copy', operator: 'is_null' },
        ],
      },
      no_website: {
        id: crypto.randomUUID(),
        logic: 'AND',
        rules: [
          { id: crypto.randomUUID(), field: 'phone', operator: 'is_not_null' },
          { id: crypto.randomUUID(), field: 'website', operator: 'is_null' },
        ],
      },
    };
    onChange(presets[preset]);
  };

  return (
    <div className="space-y-6">
      <Alert className="bg-info/10 border-info/30">
        <Info className="h-4 w-4 text-info" />
        <AlertDescription className="text-sm">
          Copy generation will process all businesses from the database that match your filter rules.
          Build rules below to target specific businesses.
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          Quick presets:
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleUsePreset('missing_copy')}
          >
            Only missing copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleUsePreset('high_rating')}
          >
            High rating + missing copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleUsePreset('no_website')}
          >
            Has phone, no website
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">Filter Rules</h4>
        <RuleBuilder ruleGroup={rules} onChange={onChange} />
      </div>
    </div>
  );
};
