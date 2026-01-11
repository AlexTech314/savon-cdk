import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCampaign, createCampaign, updateCampaign, deleteCampaign, runCampaign } from '@/lib/api';
import { Campaign, CampaignInput, PLACE_TYPES, SearchQuery, DataTier, DATA_TIERS } from '@/types/jobs';
import { GenerateQueriesModal } from '@/components/campaigns/GenerateQueriesModal';
import { estimateCampaignCost } from '@/lib/pricing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Loader2, 
  Sparkles, 
  List, 
  X,
  Play,
  RefreshCw,
  Save,
  Megaphone,
  Calendar,
  DollarSign,
  Search,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

// Threshold for switching to bulk mode
const BULK_MODE_THRESHOLD = 20;

const CampaignDetailPage: React.FC = () => {
  const { campaign_id } = useParams<{ campaign_id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Detect if we're creating a new campaign
  const isNewCampaign = !campaign_id || campaign_id === 'new';

  // State
  const [isEditing, setIsEditing] = useState(isNewCampaign);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  
  // Form state (used when editing or creating)
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [searches, setSearches] = useState<SearchQuery[]>([{ textQuery: '', includedType: '' }]);
  const [maxResultsPerSearch, setMaxResultsPerSearch] = useState(60);
  const [dataTier, setDataTier] = useState<DataTier>('enterprise');

  // Fetch campaign (only if not new)
  const { data: campaign, isLoading, error } = useQuery({
    queryKey: ['campaign', campaign_id],
    queryFn: () => getCampaign(campaign_id!),
    enabled: !isNewCampaign && !!campaign_id,
  });

  // Start editing mode with current campaign data
  const startEditing = () => {
    if (campaign) {
      setName(campaign.name);
      setDescription(campaign.description || '');
      setSearches(campaign.searches);
      setMaxResultsPerSearch(campaign.max_results_per_search);
      setDataTier(campaign.data_tier || 'enterprise');
      setIsEditing(true);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

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

  // Mutations
  const createMutation = useMutation({
    mutationFn: (input: CampaignInput) => createCampaign(input),
    onSuccess: (newCampaign) => {
      toast({
        title: 'Campaign Created',
        description: 'Your campaign has been created.',
      });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      // Navigate to the new campaign's detail page
      navigate(`/campaigns/${newCampaign.campaign_id}`, { replace: true });
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
    mutationFn: (input: CampaignInput) => updateCampaign(campaign_id!, input),
    onSuccess: () => {
      toast({
        title: 'Campaign Updated',
        description: 'Your campaign has been saved.',
      });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaign_id] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setIsEditing(false);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update campaign.',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCampaign,
    onSuccess: () => {
      toast({
        title: 'Campaign Deleted',
        description: 'The campaign has been deleted.',
      });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      navigate('/campaigns');
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete campaign.',
        variant: 'destructive',
      });
    },
  });

  const runMutation = useMutation({
    mutationFn: (options: { campaignId: string; skipCachedSearches: boolean }) => 
      runCampaign(options),
    onSuccess: (job, variables) => {
      toast({
        title: 'Campaign Started',
        description: variables.skipCachedSearches
          ? `Job ${job.job_id.slice(0, 8)}... is running (skipping cached searches).`
          : `Job ${job.job_id.slice(0, 8)}... is running (fresh search - all queries).`,
      });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaign_id] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to start campaign.',
        variant: 'destructive',
      });
    },
  });

  // Search editing functions
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
    const existingValid = searches.filter(s => s.textQuery.trim());
    const newSearches = queries.map(q => ({
      textQuery: q.textQuery,
      includedType: q.includedType,
    }));
    setSearches([...existingValid, ...newSearches]);
    
    toast({
      title: 'Queries Generated',
      description: `Added ${queries.length} search queries.`,
    });
  };

  const handleSave = () => {
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
      onlyWithoutWebsite: false,
      dataTier,
    };

    if (isNewCampaign) {
      createMutation.mutate(input);
    } else {
      updateMutation.mutate(input);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // Loading state (only for existing campaigns)
  if (!isNewCampaign && isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state (only for existing campaigns)
  if (!isNewCampaign && (error || !campaign)) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate('/campaigns')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Campaigns
        </Button>
        <Card className="border-destructive">
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-medium text-foreground mb-2">Campaign Not Found</h3>
            <p className="text-muted-foreground">
              This campaign may have been deleted or doesn't exist.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // For existing campaigns, get tier config and cost estimate
  const tierConfig = campaign 
    ? DATA_TIERS.find(t => t.value === (campaign.data_tier || 'enterprise'))
    : DATA_TIERS.find(t => t.value === dataTier);
  
  const costEstimate = campaign
    ? estimateCampaignCost(campaign.searches.length, campaign.max_results_per_search, campaign.data_tier)
    : estimateCampaignCost(searches.filter(s => s.textQuery.trim()).length, maxResultsPerSearch, dataTier);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/campaigns')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" />
              {isNewCampaign ? 'New Campaign' : campaign?.name}
            </h1>
            <p className="text-muted-foreground">
              {isNewCampaign 
                ? 'Create a new search campaign'
                : (campaign?.description || 'No description')
              }
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isNewCampaign ? (
            <>
              <Button variant="outline" onClick={() => navigate('/campaigns')} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Create Campaign
              </Button>
            </>
          ) : !isEditing ? (
            <>
              <Button 
                variant="outline" 
                onClick={() => runMutation.mutate({ 
                  campaignId: campaign!.campaign_id, 
                  skipCachedSearches: true 
                })}
                disabled={runMutation.isPending}
                className="gap-2"
              >
                {runMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Run Campaign
              </Button>
              <Button onClick={startEditing} className="gap-2">
                Edit Campaign
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={cancelEditing} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {isEditing ? (
            // Editing Mode
            <>
              {/* Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                      placeholder="Optional description..."
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Search Queries */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Search Queries</span>
                    {searches.length > 0 && (
                      <Badge variant="secondary">
                        {searches.filter(s => s.textQuery.trim()).length} queries
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Use city-level queries for best results (up to 60 results each)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                      
                      <ScrollArea className="h-48 rounded border border-border bg-background p-2">
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
                  ) : (
                    <>
                      <div className="space-y-3">
                        {searches.map((search, index) => (
                          <div key={index} className="flex gap-2 items-center">
                            <Input
                              placeholder="e.g. plumbers in Houston TX"
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
                </CardContent>
              </Card>

              {/* Data Tier */}
              <Card>
                <CardHeader>
                  <CardTitle>Data Tier</CardTitle>
                  <CardDescription>
                    Choose how much data to fetch per business
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {DATA_TIERS.map((tier) => {
                      const isSelected = dataTier === tier.value;
                      return (
                        <div
                          key={tier.value}
                          onClick={() => setDataTier(tier.value)}
                          className={`relative cursor-pointer rounded-lg border-2 p-4 transition-all ${
                            isSelected 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border hover:border-muted-foreground/50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{tier.label}</span>
                                <Badge variant={isSelected ? 'default' : 'secondary'} className="text-xs">
                                  ${tier.cost}/1000
                                </Badge>
                                {tier.value === 'enterprise' && (
                                  <Badge variant="outline" className="text-xs text-primary border-primary">
                                    Recommended
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">{tier.description}</p>
                            </div>
                            <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                              isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                            }`}>
                              {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                            </div>
                          </div>
                          
                          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
                            {tier.includes.map((feature, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <div className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-primary' : 'bg-muted-foreground/50'}`} />
                                {feature}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                </CardContent>
              </Card>
            </>
          ) : (
            // View Mode
            <>
              {/* Search Queries */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5 text-primary" />
                    Search Queries
                    <Badge variant="secondary" className="ml-auto">
                      {campaign.searches.length} queries
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64 rounded border border-border bg-muted/30 p-3">
                    <div className="space-y-2">
                      {campaign.searches.map((search, index) => (
                        <div key={index} className="flex items-center gap-3 text-sm py-1">
                          <span className="text-muted-foreground w-8 text-right shrink-0">
                            {index + 1}.
                          </span>
                          <span className="flex-1">{search.textQuery}</span>
                          {search.includedType && (
                            <Badge variant="outline" className="shrink-0">
                              {PLACE_TYPES.find(t => t.value === search.includedType)?.label || search.includedType}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Data Tier Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Data Tier</CardTitle>
                </CardHeader>
                <CardContent>
                  {tierConfig && (
                    <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-lg">{tierConfig.label}</span>
                        <Badge>${tierConfig.cost}/1000 requests</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{tierConfig.description}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {tierConfig.includes.map((feature, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                            {feature}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isNewCampaign ? 'Estimated Stats' : 'Campaign Stats'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Search className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {isNewCampaign 
                      ? searches.filter(s => s.textQuery.trim()).length 
                      : campaign?.searches.length || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Search Queries</p>
                </div>
              </div>
              
              <Separator />
              
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{costEstimate.formatted}</p>
                  <p className="text-xs text-muted-foreground">Est. Cost per Run</p>
                </div>
              </div>
              
              {!isNewCampaign && (
                <>
                  <Separator />
                  
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {campaign?.last_run_at 
                          ? formatDistanceToNow(new Date(campaign.last_run_at), { addSuffix: true })
                          : 'Never'}
                      </p>
                      <p className="text-xs text-muted-foreground">Last Run</p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions - Only for existing campaigns */}
          {!isNewCampaign && !isEditing && campaign && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  className="w-full justify-start gap-2"
                  onClick={() => runMutation.mutate({ 
                    campaignId: campaign.campaign_id, 
                    skipCachedSearches: true 
                  })}
                  disabled={runMutation.isPending}
                >
                  <Play className="h-4 w-4" />
                  Run (Skip Cached)
                </Button>
                <Button 
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => runMutation.mutate({ 
                    campaignId: campaign.campaign_id, 
                    skipCachedSearches: false 
                  })}
                  disabled={runMutation.isPending}
                >
                  <RefreshCw className="h-4 w-4" />
                  Run (Fresh Search)
                </Button>
                <Separator className="my-2" />
                <Button 
                  variant="ghost"
                  className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Campaign
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Metadata - Only for existing campaigns */}
          {!isNewCampaign && campaign && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max per Search</span>
                  <span className="font-medium">{campaign.max_results_per_search}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-medium">
                    {format(new Date(campaign.created_at), 'MMM d, yyyy')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Updated</span>
                  <span className="font-medium">
                    {format(new Date(campaign.updated_at), 'MMM d, yyyy')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {campaign.campaign_id.slice(0, 8)}...
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tier info card for new campaigns */}
          {isNewCampaign && tierConfig && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Selected Tier</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{tierConfig.label}</span>
                    <Badge variant="secondary">${tierConfig.cost}/1000</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{tierConfig.description}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Generate Queries Modal */}
      <GenerateQueriesModal
        open={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        onGenerate={handleGeneratedQueries}
      />

      {/* Delete Confirmation - only for existing campaigns */}
      {campaign && (
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Campaign?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{campaign.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate(campaign.campaign_id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};

export default CampaignDetailPage;
