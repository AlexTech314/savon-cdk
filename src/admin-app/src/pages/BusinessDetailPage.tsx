import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBusiness, deleteBusiness, generateCopy, getScrapeData } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  Building2,
  Phone,
  Globe,
  MapPin,
  Star,
  ExternalLink,
  RefreshCw,
  Trash2,
  FileText,
  Loader2,
  Download,
  FileJson,
  Eye,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

const BusinessDetailPage: React.FC = () => {
  const { place_id } = useParams<{ place_id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  const { data: business, isLoading } = useQuery({
    queryKey: ['business', place_id],
    queryFn: () => getBusiness(place_id!),
    enabled: !!place_id,
  });

  // Fetch scrape data URLs if business has been scraped
  const { data: scrapeData, isLoading: isScrapeDataLoading, refetch: refetchScrapeData } = useQuery({
    queryKey: ['scrapeData', place_id],
    queryFn: () => getScrapeData(place_id!),
    enabled: !!place_id && !!business?.web_scraped,
  });

  // State for extracted data preview
  const [extractedPreview, setExtractedPreview] = useState<unknown | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteBusiness(place_id!),
    onSuccess: () => {
      toast({
        title: 'Deleted',
        description: 'Business deleted successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      navigate('/businesses');
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete business.',
        variant: 'destructive',
      });
    },
  });

  const generateCopyMutation = useMutation({
    mutationFn: () => generateCopy(place_id!),
    onSuccess: () => {
      toast({
        title: 'Preview Generated',
        description: 'Business preview has been generated.',
      });
      queryClient.invalidateQueries({ queryKey: ['business', place_id] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to generate preview.',
        variant: 'destructive',
      });
    },
  });

  const handlePreview = () => {
    // Open preview in main UI's iframe wrapper at /preview/:id
    window.open(`https://alpha.savondesigns.com/preview/${place_id}`, '_blank');
  };

  // Load and decompress extracted data for preview
  const loadExtractedPreview = async () => {
    if (!scrapeData?.urls.extracted?.url) return;
    
    setIsLoadingPreview(true);
    try {
      const response = await fetch(scrapeData.urls.extracted.url);
      const blob = await response.blob();
      
      // Decompress gzip
      const ds = new DecompressionStream('gzip');
      const decompressedStream = blob.stream().pipeThrough(ds);
      const decompressedBlob = await new Response(decompressedStream).blob();
      const text = await decompressedBlob.text();
      const data = JSON.parse(text);
      
      setExtractedPreview(data);
    } catch (error) {
      console.error('Failed to load preview:', error);
      toast({
        title: 'Error',
        description: 'Failed to load scraped data preview.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Download handler
  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      
      // Decompress gzip
      const ds = new DecompressionStream('gzip');
      const decompressedStream = blob.stream().pipeThrough(ds);
      const decompressedBlob = await new Response(decompressedStream).blob();
      
      // Create download link
      const downloadUrl = URL.createObjectURL(decompressedBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename.replace('.gz', '');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Failed to download:', error);
      toast({
        title: 'Error',
        description: 'Failed to download file.',
        variant: 'destructive',
      });
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-lg font-medium">Business not found</p>
        <Button variant="link" onClick={() => navigate('/businesses')}>
          Back to businesses
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/businesses')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{business.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary">{business.business_type}</Badge>
              {business.generated_copy && (
                <Badge className="bg-accent/20 text-accent border-accent/30">
                  Has Copy
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePreview} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            View Preview
          </Button>
          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Business Info */}
        <Card className="card-gradient border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Business Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Address</p>
                <div className="flex items-start gap-2 mt-1">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <p className="text-sm">
                    {business.address}<br />
                    {business.city}, {business.state}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <div className="flex items-center gap-2 mt-1">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm">{business.phone}</p>
                </div>
              </div>

              {business.website && (
                <div>
                  <p className="text-sm text-muted-foreground">Website</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={business.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      {business.website}
                    </a>
                  </div>
                </div>
              )}

              {business.rating && (
                <div>
                  <p className="text-sm text-muted-foreground">Rating</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Star className="h-4 w-4 text-warning fill-warning" />
                    <p className="text-sm">
                      {business.rating} ({business.review_count} reviews)
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Place ID</span>
                  <span className="font-mono text-xs">{business.place_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{format(new Date(business.created_at), 'MMM d, yyyy h:mm a')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Updated</span>
                  <span>{format(new Date(business.updated_at), 'MMM d, yyyy h:mm a')}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Generated Preview */}
        <Card className="card-gradient border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Generated Preview
            </CardTitle>
            <Button
              size="sm"
              onClick={() => generateCopyMutation.mutate()}
              disabled={generateCopyMutation.isPending}
              className="gap-2"
            >
              {generateCopyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {business.generated_copy ? 'Regenerate Preview' : 'Generate Preview'}
            </Button>
          </CardHeader>
          <CardContent>
            {business.generated_copy ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Headline</p>
                  <p className="text-lg font-semibold">{business.generated_copy.headline}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tagline</p>
                  <p className="text-base italic">{business.generated_copy.tagline}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Services</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {business.generated_copy.services.map((service, i) => (
                      <Badge key={i} variant="outline">{service}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">About</p>
                  <p className="text-sm text-foreground/90">{business.generated_copy.about}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No preview generated yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Click "Generate" to create marketing copy for this business
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scraped Data Section */}
      {business.web_scraped && (
        <Card className="card-gradient border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Scraped Website Data
            </CardTitle>
            {business.web_scraped_at && (
              <Badge variant="secondary" className="text-xs">
                Scraped {formatDistanceToNow(new Date(business.web_scraped_at), { addSuffix: true })}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Scrape Metadata */}
            <div className="grid gap-4 sm:grid-cols-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">Method</p>
                <p className="text-sm font-medium capitalize">{business.web_scrape_method || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pages Scraped</p>
                <p className="text-sm font-medium">{business.web_pages_count || 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Size</p>
                <p className="text-sm font-medium">{formatBytes(business.web_total_bytes)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="text-sm font-medium">
                  {business.web_scrape_duration_ms 
                    ? `${(business.web_scrape_duration_ms / 1000).toFixed(1)}s` 
                    : 'N/A'}
                </p>
              </div>
            </div>

            {/* Download Buttons */}
            <div className="flex flex-wrap gap-3">
              {scrapeData?.urls.extracted && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadExtractedPreview}
                    disabled={isLoadingPreview}
                    className="gap-2"
                  >
                    {isLoadingPreview ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    Preview Extracted Data
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(
                      scrapeData.urls.extracted!.url,
                      `${place_id}-extracted.json`
                    )}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download Extracted
                  </Button>
                </>
              )}
              {scrapeData?.urls.raw && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(
                    scrapeData.urls.raw!.url,
                    `${place_id}-raw.json`
                  )}
                  className="gap-2"
                >
                  <FileJson className="h-4 w-4" />
                  Download Raw HTML
                </Button>
              )}
              {isScrapeDataLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading download links...
                </div>
              )}
            </div>

            {/* Extracted Data Preview */}
            {extractedPreview && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Extracted Data Preview</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExtractedPreview(null)}
                  >
                    Close Preview
                  </Button>
                </div>
                <pre className="p-4 bg-muted rounded-lg text-xs overflow-auto max-h-96">
                  {JSON.stringify(extractedPreview, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Business</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{business.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BusinessDetailPage;
