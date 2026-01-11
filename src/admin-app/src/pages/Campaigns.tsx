import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getCampaigns, deleteCampaign, runCampaign } from '@/lib/api';
import { Campaign, DATA_TIERS } from '@/types/jobs';
import { estimateCampaignCost } from '@/lib/pricing';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Plus, 
  MoreHorizontal, 
  Play, 
  Eye, 
  Trash2,
  Search,
  Loader2,
  Megaphone,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const Campaigns: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: getCampaigns,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCampaign,
    onSuccess: () => {
      toast({
        title: 'Campaign Deleted',
        description: 'The campaign has been deleted.',
      });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
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
          ? `Job ${job.job_id.slice(0, 8)}... is running.`
          : `Job ${job.job_id.slice(0, 8)}... is running (fresh).`,
      });
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

  const handleDelete = (campaign: Campaign) => {
    setCampaignToDelete(campaign);
    setDeleteDialogOpen(true);
  };
  
  const getTierLabel = (tier?: string) => {
    const config = DATA_TIERS.find(t => t.value === tier);
    return config?.label || 'Enterprise';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Campaigns</h1>
          <p className="text-muted-foreground">
            Define search criteria to find leads via Google Places
          </p>
        </div>
        <Button onClick={() => navigate('/campaigns/new')} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Campaign
        </Button>
      </div>

      <Card className="card-gradient border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            All Campaigns
          </CardTitle>
          <CardDescription>
            Run campaigns to search for new leads
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !campaigns || campaigns.length === 0 ? (
            <div className="text-center py-12">
              <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No campaigns yet</h3>
              <p className="text-muted-foreground mb-4">
                Create a campaign to start searching for leads.
              </p>
              <Button onClick={() => navigate('/campaigns/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Campaign
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Queries</TableHead>
                  <TableHead>Data Tier</TableHead>
                  <TableHead>Est. Cost</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow 
                    key={campaign.campaign_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/campaigns/${campaign.campaign_id}`)}
                  >
                    <TableCell>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {campaign.name}
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                        {campaign.description && (
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {campaign.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {campaign.searches_count} queries
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getTierLabel(campaign.data_tier)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-primary">
                        {estimateCampaignCost(
                          campaign.searches_count,
                          campaign.max_results_per_search,
                          campaign.data_tier
                        ).formatted}
                      </span>
                    </TableCell>
                    <TableCell>
                      {campaign.last_run_at ? (
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(campaign.last_run_at), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => navigate(`/campaigns/${campaign.campaign_id}`)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => runMutation.mutate({ 
                              campaignId: campaign.campaign_id, 
                              skipCachedSearches: true 
                            })}
                            disabled={runMutation.isPending}
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Run (skip cached)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => runMutation.mutate({ 
                              campaignId: campaign.campaign_id, 
                              skipCachedSearches: false 
                            })}
                            disabled={runMutation.isPending}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Run (fresh search)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(campaign)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{campaignToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => campaignToDelete && deleteMutation.mutate(campaignToDelete.campaign_id)}
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
    </div>
  );
};

export default Campaigns;
