import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStats } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  Building2,
  FileText,
  Briefcase,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { formatDistanceToNow, format, parseISO } from 'date-fns';

const Dashboard: React.FC = () => {
  const [statsEnabled, setStatsEnabled] = useState(false);
  
  const { data: stats, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
    enabled: statsEnabled, // Only fetch when explicitly enabled
    refetchInterval: statsEnabled ? 30000 : false,
  });

  const handleLoadStats = () => {
    setStatsEnabled(true);
    if (stats) {
      refetch();
    }
  };

  const statCards = [
    {
      title: 'Total Businesses',
      value: stats?.totalBusinesses ?? '—',
      icon: Building2,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Missing Preview',
      value: stats?.businessesMissingCopy ?? '—',
      icon: FileText,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'Active Jobs',
      value: stats?.activeJobs ?? '—',
      icon: Briefcase,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
    {
      title: 'Last Job Run',
      value: stats?.lastJobRun
        ? formatDistanceToNow(new Date(stats.lastJobRun), { addSuffix: true })
        : '—',
      icon: Clock,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
      isText: true,
    },
  ];

  const businessChartConfig = {
    count: {
      label: 'Businesses',
      color: 'hsl(var(--primary))',
    },
  };

  const jobsChartConfig = {
    count: {
      label: 'Jobs',
      color: 'hsl(var(--accent))',
    },
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your businesses and pipeline jobs
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLoadStats}
          disabled={isLoading || isFetching}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          {!statsEnabled ? 'Load Stats' : isFetching ? 'Loading...' : 'Refresh'}
        </Button>
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

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Businesses over time */}
        <Card className="card-gradient border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Businesses Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : stats?.businessesOverTime && stats.businessesOverTime.length > 0 ? (
              <ChartContainer config={businessChartConfig} className="h-[200px] w-full">
                <AreaChart
                  data={stats.businessesOverTime}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="businessGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    allowDecimals={false}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent labelFormatter={(value) => formatDate(value as string)} />}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    fill="url(#businessGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Jobs over time */}
        <Card className="card-gradient border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-accent" />
              Jobs Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : stats?.jobsOverTime && stats.jobsOverTime.length > 0 ? (
              <ChartContainer config={jobsChartConfig} className="h-[200px] w-full">
                <BarChart
                  data={stats.jobsOverTime}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    allowDecimals={false}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent labelFormatter={(value) => formatDate(value as string)} />}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--accent))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
