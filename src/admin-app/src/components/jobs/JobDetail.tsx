import React from 'react';
import { Job, JobMetrics } from '@/lib/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Loader2, 
  Timer,
  Search,
  FileText,
  Globe,
  MessageSquare,
  Image,
  Sparkles,
  BarChart3,
} from 'lucide-react';

interface JobDetailProps {
  job: Job | null;
  open: boolean;
  onClose: () => void;
}

const statusConfig: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending', className: 'bg-warning/20 text-warning border-warning/30', icon: Clock },
  RUNNING: { label: 'Running', className: 'bg-info/20 text-info border-info/30', icon: Loader2 },
  SUCCEEDED: { label: 'Succeeded', className: 'bg-accent/20 text-accent border-accent/30', icon: CheckCircle },
  FAILED: { label: 'Failed', className: 'bg-destructive/20 text-destructive border-destructive/30', icon: AlertCircle },
  TIMED_OUT: { label: 'Timed Out', className: 'bg-destructive/20 text-destructive border-destructive/30', icon: AlertCircle },
  ABORTED: { label: 'Aborted', className: 'bg-destructive/20 text-destructive border-destructive/30', icon: AlertCircle },
};

// Helper to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Metric card component
interface MetricStat {
  label: string;
  value: number | string;
  variant?: 'default' | 'success' | 'error';
}

interface MetricCardProps {
  icon: React.ElementType;
  title: string;
  stats: MetricStat[];
}

const MetricCard: React.FC<MetricCardProps> = ({ icon: Icon, title, stats }) => {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">{title}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {stats.map((stat, idx) => (
          <div key={idx} className="text-center">
            <p className={cn(
              'text-lg font-semibold',
              stat.variant === 'success' && 'text-accent',
              stat.variant === 'error' && stat.value !== 0 && 'text-destructive',
            )}>
              {stat.value}
            </p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export const JobDetail: React.FC<JobDetailProps> = ({ job, open, onClose }) => {
  if (!job) return null;

  const config = statusConfig[job.status] || statusConfig.FAILED;
  const StatusIcon = config.icon;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-primary" />
            Job Details
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status */}
          <div className="flex items-center gap-3">
            <Badge className={cn('border text-base py-1 px-3', config.className)}>
              <StatusIcon className={cn('mr-2 h-4 w-4', job.status === 'RUNNING' && 'animate-spin')} />
              {config.label}
            </Badge>
          </div>

          {/* Job ID */}
          <div>
            <p className="text-sm font-medium text-muted-foreground">Job ID</p>
            <p className="mt-1 font-mono text-sm break-all">{job.job_id}</p>
          </div>

          <Separator />

          {/* Campaign */}
          <div>
            <p className="text-sm font-medium text-muted-foreground">Campaign</p>
            <p className="mt-1 font-medium">{job.campaign_name || 'Unknown Campaign'}</p>
          </div>

          {/* Timestamps */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p className="mt-1 text-sm">
                {format(new Date(job.created_at), 'MMM d, yyyy h:mm:ss a')}
              </p>
            </div>
            {job.started_at && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Started</p>
                <p className="mt-1 text-sm">
                  {format(new Date(job.started_at), 'MMM d, yyyy h:mm:ss a')}
                </p>
              </div>
            )}
            {job.completed_at && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <p className="mt-1 text-sm">
                  {format(new Date(job.completed_at), 'MMM d, yyyy h:mm:ss a')}
                </p>
              </div>
            )}
          </div>

          {/* Metrics */}
          {job.metrics && Object.keys(job.metrics).length > 0 && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium text-muted-foreground">Job Metrics</p>
                </div>
                <div className="space-y-3">
                  {/* Search Metrics */}
                  {job.metrics.search && (
                    <MetricCard
                      icon={Search}
                      title="Search"
                      stats={[
                        { label: 'Queries Run', value: job.metrics.search.queries_run },
                        { label: 'Businesses Found', value: job.metrics.search.businesses_found },
                        ...(job.metrics.search.cached_skipped ? [{ label: 'Cached Skipped', value: job.metrics.search.cached_skipped }] : []),
                      ]}
                    />
                  )}
                  
                  {/* Details Metrics */}
                  {job.metrics.details && (
                    <MetricCard
                      icon={FileText}
                      title="Details"
                      stats={[
                        { label: 'Processed', value: job.metrics.details.processed, variant: 'success' },
                        { label: 'Failed', value: job.metrics.details.failed, variant: 'error' },
                        { label: 'Filtered', value: job.metrics.details.filtered },
                      ]}
                    />
                  )}
                  
                  {/* Scrape Metrics */}
                  {job.metrics.scrape && (
                    <MetricCard
                      icon={Globe}
                      title="Scrape"
                      stats={[
                        { label: 'Processed', value: job.metrics.scrape.processed, variant: 'success' },
                        { label: 'Failed', value: job.metrics.scrape.failed, variant: 'error' },
                        { label: 'Pages', value: job.metrics.scrape.total_pages },
                        { label: 'Cloudscraper', value: job.metrics.scrape.cloudscraper_count },
                        { label: 'Puppeteer', value: job.metrics.scrape.puppeteer_count },
                        { label: 'Size', value: formatBytes(job.metrics.scrape.total_bytes) },
                      ]}
                    />
                  )}
                  
                  {/* Enrich Metrics */}
                  {job.metrics.enrich && (
                    <MetricCard
                      icon={MessageSquare}
                      title="Reviews"
                      stats={[
                        { label: 'Processed', value: job.metrics.enrich.processed, variant: 'success' },
                        { label: 'Failed', value: job.metrics.enrich.failed, variant: 'error' },
                        { label: 'With Reviews', value: job.metrics.enrich.with_reviews },
                        { label: 'Without Reviews', value: job.metrics.enrich.without_reviews },
                      ]}
                    />
                  )}
                  
                  {/* Photos Metrics */}
                  {job.metrics.photos && (
                    <MetricCard
                      icon={Image}
                      title="Photos"
                      stats={[
                        { label: 'Processed', value: job.metrics.photos.processed, variant: 'success' },
                        { label: 'Failed', value: job.metrics.photos.failed, variant: 'error' },
                        { label: 'Photos Downloaded', value: job.metrics.photos.photos_downloaded },
                      ]}
                    />
                  )}
                  
                  {/* Copy Metrics */}
                  {job.metrics.copy && (
                    <MetricCard
                      icon={Sparkles}
                      title="Copy"
                      stats={[
                        { label: 'Processed', value: job.metrics.copy.processed, variant: 'success' },
                        { label: 'Failed', value: job.metrics.copy.failed, variant: 'error' },
                        { label: 'Skipped (No Reviews)', value: job.metrics.copy.skipped_no_reviews },
                      ]}
                    />
                  )}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Input Parameters */}
          <div>
            <p className="text-sm font-medium text-muted-foreground">Input Parameters</p>
            <div className="mt-2 rounded-lg bg-muted p-4 font-mono text-sm">
              <pre className="whitespace-pre-wrap break-all">
                {JSON.stringify(job.input, null, 2)}
              </pre>
            </div>
          </div>

          {/* Error */}
          {job.error && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium text-destructive">Error Message</p>
                <div className="mt-2 rounded-lg bg-destructive/10 border border-destructive/30 p-4">
                  <p className="text-sm text-destructive">{job.error}</p>
                </div>
              </div>
            </>
          )}

          {/* Logs placeholder */}
          <Separator />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Logs</p>
            <div className="mt-2 rounded-lg bg-muted p-4 font-mono text-xs text-muted-foreground">
              <p>[{format(new Date(job.created_at), 'HH:mm:ss')}] Job created</p>
              {job.started_at && (
                <p>[{format(new Date(job.started_at), 'HH:mm:ss')}] Job started</p>
              )}
              {job.status === 'RUNNING' && (
                <p className="text-info">[...] Processing...</p>
              )}
              {job.completed_at && (
                <p className={job.status === 'SUCCEEDED' ? 'text-accent' : 'text-destructive'}>
                  [{format(new Date(job.completed_at), 'HH:mm:ss')}] Job {job.status.toLowerCase()}
                </p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
