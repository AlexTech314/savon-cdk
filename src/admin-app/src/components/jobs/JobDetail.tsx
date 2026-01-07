import React from 'react';
import { Job } from '@/lib/types';
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
import { AlertCircle, CheckCircle, Clock, Loader2, Timer } from 'lucide-react';

interface JobDetailProps {
  job: Job | null;
  open: boolean;
  onClose: () => void;
}

const statusConfig: Record<Job['status'], { label: string; className: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending', className: 'bg-warning/20 text-warning border-warning/30', icon: Clock },
  RUNNING: { label: 'Running', className: 'bg-info/20 text-info border-info/30', icon: Loader2 },
  SUCCEEDED: { label: 'Succeeded', className: 'bg-accent/20 text-accent border-accent/30', icon: CheckCircle },
  FAILED: { label: 'Failed', className: 'bg-destructive/20 text-destructive border-destructive/30', icon: AlertCircle },
};

const jobTypeLabels: Record<Job['job_type'], string> = {
  places: 'Google Places Search',
  copy: 'Generate LLM Copy',
  both: 'Places + Copy Pipeline',
};

export const JobDetail: React.FC<JobDetailProps> = ({ job, open, onClose }) => {
  if (!job) return null;

  const config = statusConfig[job.status];
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

          {/* Type */}
          <div>
            <p className="text-sm font-medium text-muted-foreground">Type</p>
            <p className="mt-1">{jobTypeLabels[job.job_type]}</p>
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
            {job.records_processed !== undefined && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Records Processed</p>
                <p className="mt-1 text-sm font-semibold text-accent">
                  {job.records_processed}
                </p>
              </div>
            )}
          </div>

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
