import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getJobs } from '@/lib/api';
import { Job } from '@/lib/types';
import { JobsTable } from '@/components/jobs/JobsTable';
import { JobDetail } from '@/components/jobs/JobDetail';
import { Button } from '@/components/ui/button';
import { Megaphone } from 'lucide-react';

const Jobs: React.FC = () => {
  const [page, setPage] = useState(1);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['jobs', page],
    queryFn: () => getJobs({ page, limit: 20 }),
    refetchInterval: (query) => {
      const jobs = query.state.data?.data || [];
      const hasRunning = jobs.some(j => j.status === 'RUNNING' || j.status === 'PENDING');
      return hasRunning ? 10000 : false;
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Jobs</h1>
          <p className="text-muted-foreground">Campaign jobs and their status</p>
        </div>
        <Button asChild className="gap-2">
          <Link to="/campaigns">
            <Megaphone className="h-4 w-4" />
            Go to Campaigns
          </Link>
        </Button>
      </div>

      <JobsTable
        jobs={data?.data ?? []}
        isLoading={isLoading || isFetching}
        page={page}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        onRowClick={setSelectedJob}
      />

      <JobDetail
        job={selectedJob}
        open={!!selectedJob}
        onClose={() => setSelectedJob(null)}
      />
    </div>
  );
};

export default Jobs;
