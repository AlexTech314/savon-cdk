import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getJobs } from '@/lib/api';
import { Job } from '@/lib/types';
import { JobsTable } from '@/components/jobs/JobsTable';
import { JobDetail } from '@/components/jobs/JobDetail';
import { Button } from '@/components/ui/button';
import { Megaphone } from 'lucide-react';

const Jobs: React.FC = () => {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [tokenHistory, setTokenHistory] = useState<(string | undefined)[]>([undefined]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentToken = tokenHistory[currentIndex];

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['jobs', currentToken],
    queryFn: () => getJobs({ limit: 20, nextToken: currentToken }),
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs || [];
      const hasRunning = jobs.some(j => j.status === 'RUNNING' || j.status === 'PENDING');
      return hasRunning ? 10000 : false;
    },
  });

  const handleNextPage = useCallback(() => {
    if (data?.nextToken) {
      // If we're navigating forward and there's a next token
      const nextIndex = currentIndex + 1;
      if (nextIndex >= tokenHistory.length) {
        // Add new token to history
        setTokenHistory(prev => [...prev, data.nextToken]);
      }
      setCurrentIndex(nextIndex);
    }
  }, [data?.nextToken, currentIndex, tokenHistory.length]);

  const handlePrevPage = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const currentPage = currentIndex + 1;
  const hasNextPage = !!data?.nextToken;
  const hasPrevPage = currentIndex > 0;

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
        jobs={data?.jobs ?? []}
        isLoading={isLoading || isFetching}
        currentPage={currentPage}
        hasNextPage={hasNextPage}
        hasPrevPage={hasPrevPage}
        onNextPage={handleNextPage}
        onPrevPage={handlePrevPage}
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
