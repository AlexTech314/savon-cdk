import React, { useState, useEffect, useMemo } from 'react';
import { loadCities, getStates, getCitiesByState, generateSearchQueries, City, State } from '@/lib/cities';
import { PLACE_TYPES } from '@/types/jobs';
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
import { Loader2, Sparkles, MapPin, X } from 'lucide-react';

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
];

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
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
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
                  {selectedStates.length === states.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              
              {selectedStates.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {selectedStates.map(stateId => {
                    const state = states.find(s => s.id === stateId);
                    return (
                      <Badge
                        key={stateId}
                        variant="secondary"
                        className="gap-1 cursor-pointer hover:bg-destructive/20"
                        onClick={() => handleStateToggle(stateId)}
                      >
                        {state?.name || stateId}
                        <X className="h-3 w-3" />
                      </Badge>
                    );
                  })}
                </div>
              )}
              
              <ScrollArea className="h-40 rounded-md border p-2">
                <div className="grid grid-cols-3 gap-2">
                  {states.map(state => (
                    <div key={state.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={state.id}
                        checked={selectedStates.includes(state.id)}
                        onCheckedChange={() => handleStateToggle(state.id)}
                      />
                      <label
                        htmlFor={state.id}
                        className="text-sm cursor-pointer"
                      >
                        {state.name}
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
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Preview</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {preview.queries.length} queries will be generated for {preview.cities.length} cities
                </p>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {preview.queries.slice(0, 10).map((q, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {q}
                    </Badge>
                  ))}
                  {preview.queries.length > 10 && (
                    <Badge variant="outline" className="text-xs">
                      +{preview.queries.length - 10} more
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
