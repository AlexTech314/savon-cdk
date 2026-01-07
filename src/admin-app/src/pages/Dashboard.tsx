import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStats } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2,
  FileText,
  Briefcase,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const Dashboard: React.FC = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
    refetchInterval: 30000,
  });

  const statCards = [
    {
      title: 'Total Businesses',
      value: stats?.totalBusinesses ?? 0,
      icon: Building2,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Missing Copy',
      value: stats?.businessesMissingCopy ?? 0,
      icon: FileText,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'Active Jobs',
      value: stats?.activeJobs ?? 0,
      icon: Briefcase,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
    {
      title: 'Last Job Run',
      value: stats?.lastJobRun
        ? formatDistanceToNow(new Date(stats.lastJobRun), { addSuffix: true })
        : 'Never',
      icon: Clock,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
      isText: true,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your businesses and pipeline jobs
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="card-gradient border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`rounded-lg p-2 ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className={`text-2xl font-bold ${stat.isText ? 'text-base' : ''}`}>
                  {stat.value}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="card-gradient border-border">
          <CardHeader>
            <CardTitle className="text-lg">Recent Businesses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              View the most recently added businesses in the{' '}
              <a href="/businesses" className="text-primary hover:underline">
                Businesses
              </a>{' '}
              section.
            </p>
          </CardContent>
        </Card>

        <Card className="card-gradient border-border">
          <CardHeader>
            <CardTitle className="text-lg">Pipeline Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Monitor active and completed jobs in the{' '}
              <a href="/jobs" className="text-primary hover:underline">
                Jobs
              </a>{' '}
              section.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
