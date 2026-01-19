import React from 'react';
import { Job, JobMetrics } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// Calculate total processed/failed from all metrics
function getMetricsSummary(metrics?: JobMetrics): { processed: number; failed: number } | null {
  if (!metrics) return null;
  
  let processed = 0;
  let failed = 0;
  
  if (metrics.search) {
    processed += metrics.search.businesses_found;
  }
  if (metrics.details) {
    processed += metrics.details.processed;
    failed += metrics.details.failed;
  }
  if (metrics.scrape) {
    processed += metrics.scrape.processed;
    failed += metrics.scrape.failed;
  }
  if (metrics.enrich) {
    processed += metrics.enrich.processed;
    failed += metrics.enrich.failed;
  }
  if (metrics.photos) {
    processed += metrics.photos.processed;
    failed += metrics.photos.failed;
  }
  if (metrics.copy) {
    processed += metrics.copy.processed;
    failed += metrics.copy.failed;
  }
  
  if (processed === 0 && failed === 0) return null;
  
  return { processed, failed };
}

interface JobsTableProps {
  jobs: Job[];
  isLoading: boolean;
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
  onRowClick: (job: Job) => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-warning/20 text-warning border-warning/30' },
  RUNNING: { label: 'Running', className: 'bg-info/20 text-info border-info/30 status-running' },
  SUCCEEDED: { label: 'Succeeded', className: 'bg-accent/20 text-accent border-accent/30' },
  FAILED: { label: 'Failed', className: 'bg-destructive/20 text-destructive border-destructive/30' },
  TIMED_OUT: { label: 'Timed Out', className: 'bg-destructive/20 text-destructive border-destructive/30' },
  ABORTED: { label: 'Aborted', className: 'bg-destructive/20 text-destructive border-destructive/30' },
};

export const JobsTable: React.FC<JobsTableProps> = ({
  jobs,
  isLoading,
  currentPage,
  hasNextPage,
  hasPrevPage,
  onNextPage,
  onPrevPage,
  onRowClick,
}) => {
  const getDuration = (job: Job): string => {
    if (!job.started_at) return '-';
    
    const start = new Date(job.started_at);
    const end = job.completed_at ? new Date(job.completed_at) : new Date();
    const diffMs = end.getTime() - start.getTime();
    
    if (diffMs < 1000) return '<1s';
    if (diffMs < 60000) return `${Math.round(diffMs / 1000)}s`;
    return `${Math.round(diffMs / 60000)}m`;
  };

  if (isLoading && jobs.length === 0) {
    return (
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job ID</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Results</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-lg font-medium text-foreground">No jobs found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Start a new job to see it here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Job ID</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Results</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const config = statusConfig[job.status] || statusConfig.FAILED;
              const metricsSummary = getMetricsSummary(job.metrics);
              
              return (
                <TableRow
                  key={job.job_id}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => onRowClick(job)}
                >
                  <TableCell className="font-mono text-sm">
                    {job.job_id.substring(0, 12)}...
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">
                      {job.campaign_name || job.input?.jobType === 'pipeline' ? 'Pipeline Job' : 'Unknown Campaign'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('border', config.className)}>
                      {config.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {metricsSummary ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="flex items-center gap-1 text-accent">
                          <CheckCircle className="h-3 w-3" />
                          {metricsSummary.processed}
                        </span>
                        {metricsSummary.failed > 0 && (
                          <span className="flex items-center gap-1 text-destructive">
                            <XCircle className="h-3 w-3" />
                            {metricsSummary.failed}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.started_at
                      ? formatDistanceToNow(new Date(job.started_at), { addSuffix: true })
                      : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getDuration(job)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {currentPage}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={onPrevPage}
            disabled={!hasPrevPage}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onNextPage}
            disabled={!hasNextPage}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
