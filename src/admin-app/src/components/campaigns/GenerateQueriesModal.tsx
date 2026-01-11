import React, { useState, useEffect, useMemo } from 'react';
import { loadCities, getStates, getCitiesByState, generateSearchQueries, City, State } from '@/lib/cities';
import { PLACE_TYPES } from '@/types/jobs';
import { estimateSearchCost } from '@/lib/pricing';
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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Sparkles, MapPin, X, DollarSign } from 'lucide-react';

interface GenerateQueriesModalProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (queries: { textQuery: string; includedType: string }[]) => void;
}

const CITY_LIMITS = [
  { value: 10, label: 'Top 10 cities' },
  { value: 25, label: 'Top 25 cities' },
  { value: 50, label: 'Top 50 cities' },
  { value: 100, label: 'Top 100 cities' },
  { value: 250, label: 'Top 250 cities' },
  { value: 500, label: 'Top 500 cities' },
  { value: 1000, label: 'Top 1,000 cities' },
  { value: -1, label: 'All cities (no limit)' },
];

// US states only (excludes DC, PR, and territories)
const US_STATES_ONLY = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

// Regional presets for quick selection
const REGIONAL_PRESETS = {
  all: {
    label: 'All 50 States',
    states: US_STATES_ONLY,
  },
  continental: {
    label: 'Continental (48)',
    states: US_STATES_ONLY.filter(s => s !== 'AK' && s !== 'HI'),
  },
  eastCoast: {
    label: 'East Coast',
    states: ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA', 'DE', 'MD', 'VA', 'NC', 'SC', 'GA', 'FL'],
  },
  westCoast: {
    label: 'West Coast',
    states: ['WA', 'OR', 'CA'],
  },
  midwest: {
    label: 'Midwest',
    states: ['OH', 'MI', 'IN', 'IL', 'WI', 'MN', 'IA', 'MO', 'ND', 'SD', 'NE', 'KS'],
  },
  south: {
    label: 'South',
    states: ['TX', 'OK', 'AR', 'LA', 'MS', 'AL', 'TN', 'KY', 'WV'],
  },
  southwest: {
    label: 'Southwest',
    states: ['AZ', 'NM', 'NV', 'UT', 'CO'],
  },
  northeast: {
    label: 'Northeast',
    states: ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA'],
  },
};

export const GenerateQueriesModal: React.FC<GenerateQueriesModalProps> = ({
  open,
  onClose,
  onGenerate,
}) => {
  const [cities, setCities] = useState<City[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>('');
  const [cityLimit, setCityLimit] = useState<number>(25);

  // Load cities data
  useEffect(() => {
    if (open && cities.length === 0) {
      setLoading(true);
      loadCities()
        .then((data) => {
          setCities(data);
          setStates(getStates(data));
        })
        .finally(() => setLoading(false));
    }
  }, [open, cities.length]);

  // Calculate preview
  const preview = useMemo(() => {
    if (selectedStates.length === 0 || !selectedType) {
      return { cities: [], queries: [] };
    }
    
    const filteredCities = getCitiesByState(cities, selectedStates, cityLimit);
    const queries = generateSearchQueries(filteredCities, selectedType);
    
    return { cities: filteredCities, queries };
  }, [cities, selectedStates, selectedType, cityLimit]);

  const handleStateToggle = (stateId: string) => {
    setSelectedStates(prev =>
      prev.includes(stateId)
        ? prev.filter(s => s !== stateId)
        : [...prev, stateId]
    );
  };

  const handleSelectAllStates = () => {
    if (selectedStates.length === states.length) {
      setSelectedStates([]);
    } else {
      setSelectedStates(states.map(s => s.id));
    }
  };

  const handlePresetSelect = (presetKey: keyof typeof REGIONAL_PRESETS) => {
    const preset = REGIONAL_PRESETS[presetKey];
    const allStateIds = states.map(s => s.id);
    
    // All presets now use explicit state lists
    if ('states' in preset) {
      setSelectedStates(preset.states.filter(id => allStateIds.includes(id)));
    }
  };

  const handleGenerate = () => {
    const queries = preview.cities.map(city => ({
      textQuery: `${selectedType} in ${city.city} ${city.state_id}`,
      includedType: PLACE_TYPES.find(t => 
        t.label.toLowerCase() === selectedType.toLowerCase()
      )?.value || '',
    }));
    
    onGenerate(queries);
    onClose();
    
    // Reset form
    setSelectedStates([]);
    setSelectedType('');
    setCityLimit(25);
  };

  const canGenerate = selectedStates.length > 0 && selectedType && preview.queries.length > 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()} modal={false}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate Search Queries
          </DialogTitle>
          <DialogDescription>
            Automatically create search queries for cities across selected states.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 flex-1 overflow-hidden">
            {/* Business Type */}
            <div className="space-y-2">
              <Label>Business Type *</Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a business type..." />
                </SelectTrigger>
                <SelectContent>
                  {PLACE_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.label.toLowerCase()}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* States Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>States *</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAllStates}
                  className="h-auto py-1 px-2 text-xs"
                >
                  {selectedStates.length === states.length ? 'Deselect All' : 'Clear'}
                </Button>
              </div>
              
              {/* Quick Presets */}
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetSelect('all')}
                  className="h-7 text-xs"
                >
                  🇺🇸 All 50 States
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetSelect('continental')}
                  className="h-7 text-xs"
                >
                  Continental (48)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetSelect('eastCoast')}
                  className="h-7 text-xs"
                >
                  East Coast
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetSelect('westCoast')}
                  className="h-7 text-xs"
                >
                  West Coast
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetSelect('midwest')}
                  className="h-7 text-xs"
                >
                  Midwest
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetSelect('south')}
                  className="h-7 text-xs"
                >
                  South
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetSelect('southwest')}
                  className="h-7 text-xs"
                >
                  Southwest
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetSelect('northeast')}
                  className="h-7 text-xs"
                >
                  Northeast
                </Button>
              </div>
              
              {selectedStates.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  <span className="text-xs text-muted-foreground mr-1">{selectedStates.length} selected:</span>
                  {selectedStates.slice(0, 15).map(stateId => {
                    const state = states.find(s => s.id === stateId);
                    return (
                      <Badge
                        key={stateId}
                        variant="secondary"
                        className="gap-1 cursor-pointer hover:bg-destructive/20 text-xs py-0"
                        onClick={() => handleStateToggle(stateId)}
                      >
                        {stateId}
                        <X className="h-2.5 w-2.5" />
                      </Badge>
                    );
                  })}
                  {selectedStates.length > 15 && (
                    <Badge variant="outline" className="text-xs py-0">
                      +{selectedStates.length - 15} more
                    </Badge>
                  )}
                </div>
              )}
              
              <ScrollArea className="h-32 rounded-md border p-2">
                <div className="grid grid-cols-4 gap-1.5">
                  {states.map(state => (
                    <div key={state.id} className="flex items-center space-x-1.5">
                      <Checkbox
                        id={state.id}
                        checked={selectedStates.includes(state.id)}
                        onCheckedChange={() => handleStateToggle(state.id)}
                        className="h-3.5 w-3.5"
                      />
                      <label
                        htmlFor={state.id}
                        className="text-xs cursor-pointer"
                      >
                        {state.id}
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* City Limit */}
            <div className="space-y-2">
              <Label>Cities per State</Label>
              <Select
                value={String(cityLimit)}
                onValueChange={(v) => setCityLimit(Number(v))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CITY_LIMITS.map(option => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Cities are sorted by population (largest first)
              </p>
            </div>

            {/* Preview */}
            {canGenerate && (
              <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Preview</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <DollarSign className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium text-primary">
                      {estimateSearchCost(preview.queries.length, 20).formatted}
                    </span>
                    <span className="text-muted-foreground text-xs">estimated (20 results/query)</span>
                  </div>
                </div>
                
                <div className="bg-background/50 rounded p-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-mono">{selectedStates.length}</span>
                    <span>states</span>
                    <span>×</span>
                    {cityLimit < 0 ? (
                      <span className="font-mono">all</span>
                    ) : (
                      <span className="font-mono">≤{cityLimit.toLocaleString()}</span>
                    )}
                    <span>cities each</span>
                    <span>=</span>
                    <span className="font-mono font-medium text-foreground">{preview.queries.length.toLocaleString()}</span>
                    <span className="text-foreground">queries</span>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                  {preview.queries.slice(0, 8).map((q, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {q}
                    </Badge>
                  ))}
                  {preview.queries.length > 8 && (
                    <Badge variant="outline" className="text-xs">
                      +{preview.queries.length - 8} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={!canGenerate}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate {preview.queries.length > 0 ? `${preview.queries.length} Queries` : 'Queries'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
