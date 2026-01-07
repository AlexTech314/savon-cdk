import React from 'react';
import { Job } from '@/lib/types';
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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';

interface JobsTableProps {
  jobs: Job[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onRowClick: (job: Job) => void;
}

const statusConfig: Record<Job['status'], { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-warning/20 text-warning border-warning/30' },
  RUNNING: { label: 'Running', className: 'bg-info/20 text-info border-info/30 status-running' },
  SUCCEEDED: { label: 'Succeeded', className: 'bg-accent/20 text-accent border-accent/30' },
  FAILED: { label: 'Failed', className: 'bg-destructive/20 text-destructive border-destructive/30' },
};

const jobTypeLabels: Record<Job['job_type'], string> = {
  places: 'Google Places',
  copy: 'Generate Copy',
  both: 'Places + Copy',
};

export const JobsTable: React.FC<JobsTableProps> = ({
  jobs,
  isLoading,
  page,
  totalPages,
  onPageChange,
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
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 5 }).map((_, j) => (
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
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Records</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const config = statusConfig[job.status];
              
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
                    <Badge variant="secondary">{jobTypeLabels[job.job_type]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('border', config.className)}>
                      {config.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.started_at
                      ? formatDistanceToNow(new Date(job.started_at), { addSuffix: true })
                      : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getDuration(job)}
                  </TableCell>
                  <TableCell>
                    {job.records_processed ?? '-'}
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
          Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
