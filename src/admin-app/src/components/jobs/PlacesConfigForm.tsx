import React from 'react';
import { BUSINESS_TYPES, US_STATES, PlacesConfig } from '@/types/jobs';
import { MultiSelect } from '@/components/ui/multi-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface PlacesConfigFormProps {
  config: PlacesConfig;
  onChange: (config: PlacesConfig) => void;
  saveAsTemplate: boolean;
  onSaveAsTemplateChange: (save: boolean) => void;
  templateName: string;
  onTemplateNameChange: (name: string) => void;
}

export const PlacesConfigForm: React.FC<PlacesConfigFormProps> = ({
  config,
  onChange,
  saveAsTemplate,
  onSaveAsTemplateChange,
  templateName,
  onTemplateNameChange,
}) => {
  const businessTypeOptions = BUSINESS_TYPES.map((type) => ({
    value: type,
    label: type,
  }));

  const stateOptions = US_STATES.map((state) => ({
    value: state.code,
    label: state.name,
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Business Types</Label>
        <MultiSelect
          options={businessTypeOptions}
          selected={config.businessTypes}
          onChange={(selected) =>
            onChange({ ...config, businessTypes: selected })
          }
          placeholder="Select business types..."
          searchPlaceholder="Search types..."
        />
        <p className="text-xs text-muted-foreground">
          Select the types of businesses to search for
        </p>
      </div>

      <div className="space-y-2">
        <Label>States</Label>
        <MultiSelect
          options={stateOptions}
          selected={config.states}
          onChange={(selected) => onChange({ ...config, states: selected })}
          placeholder="Select states..."
          searchPlaceholder="Search states..."
        />
        <p className="text-xs text-muted-foreground">
          Select the states to search in
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="countPerType">Results Per Type</Label>
        <Input
          id="countPerType"
          type="number"
          min={1}
          max={100}
          value={config.countPerType}
          onChange={(e) =>
            onChange({
              ...config,
              countPerType: Math.min(100, Math.max(1, Number(e.target.value))),
            })
          }
          className="w-32"
        />
        <p className="text-xs text-muted-foreground">
          Number of businesses to fetch per type (1-100)
        </p>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="saveTemplate"
            checked={saveAsTemplate}
            onCheckedChange={(checked) => onSaveAsTemplateChange(!!checked)}
          />
          <Label htmlFor="saveTemplate" className="cursor-pointer">
            Save as template for future use
          </Label>
        </div>
        {saveAsTemplate && (
          <div className="ml-6 space-y-2">
            <Label htmlFor="templateName">Template Name</Label>
            <Input
              id="templateName"
              value={templateName}
              onChange={(e) => onTemplateNameChange(e.target.value)}
              placeholder="e.g., Florida Plumbers Pipeline"
            />
          </div>
        )}
      </div>
    </div>
  );
};
