import React, { useState, useMemo } from 'react';
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
  Users,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

// Team member from web scraping
interface TeamMember {
  name: string;
  title: string;
  source_url: string;
}

// Extracted scrape data structure
interface ExtractedScrapeData {
  place_id: string;
  website_uri: string;
  extracted_at: string;
  contacts: {
    emails: string[];
    phones: string[];
    contact_page_url: string | null;
    social: {
      linkedin?: string;
      facebook?: string;
      instagram?: string;
      twitter?: string;
    };
  };
  team: {
    members: TeamMember[];
    headcount_estimate: number | null;
    headcount_source: string | null;
    new_hire_mentions: { text: string; source_url: string }[];
  };
  acquisition: {
    signals: { text: string; signal_type: string; source_url: string }[];
    has_signal: boolean;
    summary: string | null;
  };
  history: {
    founded_year: number | null;
    founded_source: string | null;
    years_in_business: number | null;
    snippets: { text: string; source_url: string }[];
  };
}

// Pretty formatted display for extracted scrape data
const ExtractedDataPreview: React.FC<{ data: ExtractedScrapeData }> = ({ data }) => {
  const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-primary">{title}</h4>
      <div className="pl-3 border-l-2 border-border space-y-1">{children}</div>
    </div>
  );

  const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground min-w-[100px]">{label}:</span>
      <span className="text-foreground">{value || <span className="text-muted-foreground italic">None</span>}</span>
    </div>
  );

  const List: React.FC<{ items: string[] }> = ({ items }) => (
    items.length > 0 ? (
      <ul className="list-disc list-inside text-sm space-y-0.5">
        {items.map((item, i) => <li key={i} className="break-all">{item}</li>)}
      </ul>
    ) : <span className="text-sm text-muted-foreground italic">None found</span>
  );

  return (
    <div className="p-4 bg-muted/50 rounded-lg space-y-4 max-h-[500px] overflow-auto">
      {/* Header */}
      <div className="text-xs text-muted-foreground">
        Extracted {format(new Date(data.extracted_at), 'MMM d, yyyy h:mm a')} from{' '}
        <a href={data.website_uri} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          {data.website_uri}
        </a>
      </div>

      {/* Contacts */}
      <Section title="Contacts">
        <Field label="Emails" value={data.contacts.emails.length > 0 ? <List items={data.contacts.emails} /> : null} />
        <Field label="Phones" value={data.contacts.phones.length > 0 ? <List items={data.contacts.phones} /> : null} />
        <Field label="Contact Page" value={
          data.contacts.contact_page_url ? (
            <a href={data.contacts.contact_page_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
              {data.contacts.contact_page_url}
            </a>
          ) : null
        } />
        {Object.entries(data.contacts.social).filter(([, v]) => v).length > 0 && (
          <div className="space-y-1">
            <span className="text-muted-foreground text-sm">Social:</span>
            <div className="flex flex-wrap gap-2 pl-2">
              {Object.entries(data.contacts.social).map(([platform, url]) => url && (
                <a key={platform} href={url} target="_blank" rel="noopener noreferrer" 
                   className="text-xs px-2 py-1 bg-background rounded border hover:border-primary capitalize">
                  {platform}
                </a>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Team */}
      <Section title="Team">
        <Field label="Headcount" value={data.team.headcount_estimate ? `~${data.team.headcount_estimate} (${data.team.headcount_source})` : null} />
        {data.team.members.length > 0 && (
          <div className="space-y-1">
            <span className="text-muted-foreground text-sm">Members ({data.team.members.length}):</span>
            <div className="space-y-1 pl-2">
              {data.team.members.slice(0, 10).map((m, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-muted-foreground"> — {m.title}</span>
                </div>
              ))}
              {data.team.members.length > 10 && (
                <span className="text-xs text-muted-foreground">...and {data.team.members.length - 10} more</span>
              )}
            </div>
          </div>
        )}
        {data.team.new_hire_mentions.length > 0 && (
          <Field label="New Hires" value={`${data.team.new_hire_mentions.length} mention(s)`} />
        )}
      </Section>

      {/* Acquisition */}
      <Section title="Acquisition Signals">
        <Field label="Has Signal" value={data.acquisition.has_signal ? '✓ Yes' : 'No'} />
        {data.acquisition.signals.length > 0 && (
          <div className="space-y-1">
            {data.acquisition.signals.map((s, i) => (
              <div key={i} className="text-sm p-2 bg-background rounded">
                <Badge variant="outline" className="mb-1 capitalize">{s.signal_type}</Badge>
                <p className="text-xs">{s.text}</p>
              </div>
            ))}
          </div>
        )}
        {data.acquisition.summary && <Field label="Summary" value={data.acquisition.summary} />}
      </Section>

      {/* History */}
      <Section title="Business History">
        <Field label="Founded" value={data.history.founded_year ? `${data.history.founded_year} (${data.history.founded_source})` : null} />
        <Field label="Years in Business" value={data.history.years_in_business} />
        {data.history.snippets.length > 0 && (
          <div className="space-y-1">
            <span className="text-muted-foreground text-sm">History Snippets:</span>
            {data.history.snippets.slice(0, 3).map((s, i) => (
              <p key={i} className="text-xs p-2 bg-background rounded italic">"{s.text}"</p>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
};

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

  // Parse team members from JSON string
  const teamMembers = useMemo<TeamMember[]>(() => {
    if (!business?.web_team_members) return [];
    try {
      return JSON.parse(business.web_team_members) as TeamMember[];
    } catch {
      return [];
    }
  }, [business?.web_team_members]);

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

  // Load extracted data for preview
  // Note: S3 serves with Content-Encoding: gzip, so browser auto-decompresses
  const loadExtractedPreview = async () => {
    if (!scrapeData?.urls.extracted?.url) return;
    
    setIsLoadingPreview(true);
    try {
      const response = await fetch(scrapeData.urls.extracted.url, {
        mode: 'cors',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Browser auto-decompresses Content-Encoding: gzip
      const data = await response.json();
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
  // Note: S3 serves with Content-Encoding: gzip, so browser auto-decompresses
  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url, {
        mode: 'cors',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Browser auto-decompresses Content-Encoding: gzip
      const blob = await response.blob();
      
      // Create download link
      const downloadUrl = URL.createObjectURL(blob);
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
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">Website</p>
                  <div className="flex items-start gap-2 mt-1">
                    <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <a
                      href={business.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline break-all"
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

            {/* Extracted Data Summary */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Founded & History */}
              {(business.web_founded_year || business.web_years_in_business) && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Business History</p>
                  <p className="text-sm font-medium">
                    {business.web_founded_year && `Founded ${business.web_founded_year}`}
                    {business.web_founded_year && business.web_years_in_business && ' • '}
                    {business.web_years_in_business && `${business.web_years_in_business} years in business`}
                  </p>
                </div>
              )}

              {/* Contact Info */}
              {business.web_contact_page && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Contact Page</p>
                  <a 
                    href={business.web_contact_page} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline truncate block"
                  >
                    {business.web_contact_page}
                  </a>
                </div>
              )}

              {/* Phones from scrape */}
              {business.web_phones && business.web_phones.length > 0 && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Scraped Phones</p>
                  <p className="text-sm font-medium">
                    {business.web_phones.map((p: string | { S: string }) => 
                      typeof p === 'string' ? p : p.S
                    ).join(', ')}
                  </p>
                </div>
              )}

              {/* Emails from scrape */}
              {business.web_emails && business.web_emails.length > 0 && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Scraped Emails</p>
                  <p className="text-sm font-medium">
                    {business.web_emails.join(', ')}
                  </p>
                </div>
              )}

              {/* Headcount */}
              {business.web_headcount_estimate && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Estimated Headcount</p>
                  <p className="text-sm font-medium">~{business.web_headcount_estimate} employees</p>
                </div>
              )}

              {/* Team Count */}
              {business.web_team_count && business.web_team_count > 0 && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Team Members Found</p>
                  <p className="text-sm font-medium">{business.web_team_count} people</p>
                </div>
              )}
            </div>

            {/* Social Links */}
            {(business.web_social_facebook || business.web_social_instagram || 
              business.web_social_linkedin || business.web_social_twitter) && (
              <div className="flex flex-wrap gap-2">
                {business.web_social_facebook && (
                  <a href={business.web_social_facebook} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="gap-1 hover:bg-muted cursor-pointer">
                      Facebook
                      <ExternalLink className="h-3 w-3" />
                    </Badge>
                  </a>
                )}
                {business.web_social_instagram && (
                  <a href={business.web_social_instagram} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="gap-1 hover:bg-muted cursor-pointer">
                      Instagram
                      <ExternalLink className="h-3 w-3" />
                    </Badge>
                  </a>
                )}
                {business.web_social_linkedin && (
                  <a href={business.web_social_linkedin} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="gap-1 hover:bg-muted cursor-pointer">
                      LinkedIn
                      <ExternalLink className="h-3 w-3" />
                    </Badge>
                  </a>
                )}
                {business.web_social_twitter && (
                  <a href={business.web_social_twitter} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="gap-1 hover:bg-muted cursor-pointer">
                      Twitter/X
                      <ExternalLink className="h-3 w-3" />
                    </Badge>
                  </a>
                )}
              </div>
            )}

            {/* Team Members */}
            {teamMembers.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">Team Members ({teamMembers.length})</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {teamMembers.map((member, index) => (
                    <div 
                      key={index} 
                      className="p-3 bg-muted/30 rounded-lg border border-border/50"
                    >
                      <p className="font-medium text-sm">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.title}</p>
                      {member.source_url && (
                        <a 
                          href={member.source_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[10px] text-primary hover:underline mt-1 block truncate"
                          title={member.source_url}
                        >
                          Source
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Download Buttons */}
            <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
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
                    Preview Full JSON
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
                <ExtractedDataPreview data={extractedPreview as ExtractedScrapeData} />
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
