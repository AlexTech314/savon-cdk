import React, { useMemo } from 'react';
import { PLACE_TYPES, PlacesConfig, SearchQuery } from '@/types/jobs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

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
  const searches = config.searches || [{ textQuery: '', includedType: '' }];

  // Group place types by category
  const groupedTypes = useMemo(() => {
    const groups: Record<string, typeof PLACE_TYPES> = {};
    PLACE_TYPES.forEach(type => {
      const category = type.category || 'Other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(type);
    });
    return groups;
  }, []);

  const addSearch = () => {
    onChange({
      ...config,
      searches: [...searches, { textQuery: '', includedType: '' }],
    });
  };

  const removeSearch = (index: number) => {
    onChange({
      ...config,
      searches: searches.filter((_, i) => i !== index),
    });
  };

  const updateSearch = (index: number, field: keyof SearchQuery, value: string) => {
    const updated = [...searches];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...config, searches: updated });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Search Queries</Label>
        <p className="text-sm text-muted-foreground">
          Use descriptive queries like "plumbers in Alabama" or "electricians near Austin TX". 
          The type filter narrows results but won't work well with vague queries like just a state name.
        </p>
      </div>

      <div className="space-y-3">
        {searches.map((search, index) => (
          <div key={index} className="flex gap-2 items-center">
            <Input
              placeholder="e.g. plumbers in Alabama, electricians near Austin TX..."
              value={search.textQuery}
              onChange={(e) => updateSearch(index, 'textQuery', e.target.value)}
              className="flex-1"
            />
            <Select
              value={search.includedType || '_any'}
              onValueChange={(value) => updateSearch(index, 'includedType', value === '_any' ? '' : value)}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Any type" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value="_any">Any type</SelectItem>
                {Object.entries(groupedTypes).map(([category, types]) => (
                  <SelectGroup key={category}>
                    <SelectLabel className="text-xs font-semibold text-muted-foreground">
                      {category}
                    </SelectLabel>
                    {types.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeSearch(index)}
              disabled={searches.length === 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button variant="outline" onClick={addSearch} className="gap-2">
        <Plus className="h-4 w-4" />
        Add Search
      </Button>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
        <div className="space-y-2">
          <Label htmlFor="maxResults">Max Results Per Search</Label>
          <Input
            id="maxResults"
            type="number"
            min={1}
            max={60}
            value={config.maxResultsPerSearch ?? 60}
            onChange={(e) =>
              onChange({
                ...config,
                maxResultsPerSearch: Math.min(60, Math.max(1, Number(e.target.value))),
              })
            }
            className="w-32"
          />
          <p className="text-xs text-muted-foreground">
            1-60 (uses pagination)
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2 pt-6">
            <Checkbox
              id="onlyWithoutWebsite"
              checked={config.onlyWithoutWebsite ?? true}
              onCheckedChange={(checked) =>
                onChange({ ...config, onlyWithoutWebsite: !!checked })
              }
            />
            <Label htmlFor="onlyWithoutWebsite" className="cursor-pointer">
              Only businesses without websites
            </Label>
          </div>
        </div>
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
              placeholder="e.g., Texas Plumbers Search"
            />
          </div>
        )}
      </div>
    </div>
  );
};
