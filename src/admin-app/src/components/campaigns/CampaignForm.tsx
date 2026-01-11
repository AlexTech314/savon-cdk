import React, { useState, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createCampaign, updateCampaign } from '@/lib/api';
import { Campaign, CampaignInput, PLACE_TYPES, SearchQuery } from '@/types/jobs';
import { GenerateQueriesModal } from './GenerateQueriesModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Loader2, Sparkles, List, X } from 'lucide-react';

// Threshold for switching to bulk mode
const BULK_MODE_THRESHOLD = 20;

interface CampaignFormProps {
  campaign?: Campaign | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const CampaignForm: React.FC<CampaignFormProps> = ({
  campaign,
  onSuccess,
  onCancel,
}) => {
  const { toast } = useToast();
  const isEditing = !!campaign;

  // Form state
  const [name, setName] = useState(campaign?.name || '');
  const [description, setDescription] = useState(campaign?.description || '');
  const [searches, setSearches] = useState<SearchQuery[]>(
    campaign?.searches || [{ textQuery: '', includedType: '' }]
  );
  const [maxResultsPerSearch, setMaxResultsPerSearch] = useState(
    campaign?.max_results_per_search ?? 60
  );
  const [generateModalOpen, setGenerateModalOpen] = useState(false);

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

  const createMutation = useMutation({
    mutationFn: (input: CampaignInput) => createCampaign(input),
    onSuccess: () => {
      toast({
        title: 'Campaign Created',
        description: 'Your campaign has been created successfully.',
      });
      onSuccess();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create campaign.',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: CampaignInput) => updateCampaign(campaign!.campaign_id, input),
    onSuccess: () => {
      toast({
        title: 'Campaign Updated',
        description: 'Your campaign has been updated successfully.',
      });
      onSuccess();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update campaign.',
        variant: 'destructive',
      });
    },
  });

  const addSearch = () => {
    setSearches([...searches, { textQuery: '', includedType: '' }]);
  };

  const removeSearch = (index: number) => {
    setSearches(searches.filter((_, i) => i !== index));
  };

  const updateSearch = (index: number, field: keyof SearchQuery, value: string) => {
    const updated = [...searches];
    updated[index] = { ...updated[index], [field]: value };
    setSearches(updated);
  };

  const handleGeneratedQueries = (queries: { textQuery: string; includedType: string }[]) => {
    // Filter out empty existing searches and append generated ones
    const existingValid = searches.filter(s => s.textQuery.trim());
    const newSearches = queries.map(q => ({
      textQuery: q.textQuery,
      includedType: q.includedType,
    }));
    setSearches([...existingValid, ...newSearches]);
    
    toast({
      title: 'Queries Generated',
      description: `Added ${queries.length} search queries to the campaign.`,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Campaign name is required.',
        variant: 'destructive',
      });
      return;
    }

    const validSearches = searches.filter(s => s.textQuery.trim());
    if (validSearches.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'At least one search query is required.',
        variant: 'destructive',
      });
      return;
    }

    const input: CampaignInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      searches: validSearches.map(s => ({
        textQuery: s.textQuery.trim(),
        includedType: s.includedType || undefined,
      })),
      maxResultsPerSearch,
      onlyWithoutWebsite: false, // Website filtering not available in search results
    };

    if (isEditing) {
      updateMutation.mutate(input);
    } else {
      createMutation.mutate(input);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name & Description */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Campaign Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Texas Plumbers Campaign"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description of this campaign..."
            rows={2}
          />
        </div>
      </div>

      {/* Search Queries */}
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Search Queries *</Label>
            {searches.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {searches.filter(s => s.textQuery.trim()).length} queries
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Use city-level queries for best results (up to 60 results each). Example: "plumbers in Houston TX".
          </p>
        </div>

        {/* Bulk mode for large query sets */}
        {searches.length > BULK_MODE_THRESHOLD ? (
          <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <List className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">
                  {searches.filter(s => s.textQuery.trim()).length} Search Queries
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSearches([{ textQuery: '', includedType: '' }])}
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            </div>
            
            <ScrollArea className="h-32 rounded border border-border bg-background p-2">
              <div className="space-y-1">
                {searches.filter(s => s.textQuery.trim()).map((search, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-8 text-right">{index + 1}.</span>
                    <span className="truncate">{search.textQuery}</span>
                    {search.includedType && (
                      <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                        {PLACE_TYPES.find(t => t.value === search.includedType)?.label || search.includedType}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setGenerateModalOpen(true)}
                className="gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Regenerate
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Individual query editing for smaller sets */}
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
                    type="button"
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

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={addSearch} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Search
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setGenerateModalOpen(true)}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Generate from Cities
              </Button>
            </div>
          </>
        )}
      </div>

      <GenerateQueriesModal
        open={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        onGenerate={handleGeneratedQueries}
      />

      {/* Settings */}
      <div className="pt-4 border-t border-border">
        <div className="space-y-2">
          <Label htmlFor="maxResults">Max Results Per Search</Label>
          <Input
            id="maxResults"
            type="number"
            min={1}
            max={60}
            value={maxResultsPerSearch}
            onChange={(e) => setMaxResultsPerSearch(Math.min(60, Math.max(1, Number(e.target.value))))}
            className="w-32"
          />
          <p className="text-xs text-muted-foreground">
            1-60 (Google API limit per query)
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {isEditing ? 'Update Campaign' : 'Create Campaign'}
        </Button>
      </div>
    </form>
  );
};
