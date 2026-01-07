import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTemplates } from '@/lib/templates';
import { JobTemplate } from '@/types/jobs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Play, MapPin, Sparkles, Layers } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface TemplateSelectorProps {
  onSelect: (template: JobTemplate) => void;
  onRunTemplate: (template: JobTemplate) => void;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  onSelect,
  onRunTemplate,
}) => {
  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: getTemplates,
  });

  const getJobTypeIcon = (type: JobTemplate['jobType']) => {
    switch (type) {
      case 'places':
        return <MapPin className="h-4 w-4" />;
      case 'copy':
        return <Sparkles className="h-4 w-4" />;
      case 'both':
        return <Layers className="h-4 w-4" />;
    }
  };

  const getJobTypeLabel = (type: JobTemplate['jobType']) => {
    switch (type) {
      case 'places':
        return 'Places Search';
      case 'copy':
        return 'Copy Generation';
      case 'both':
        return 'Full Pipeline';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No templates saved yet</p>
        <p className="text-sm mt-1">Create a job and save it as a template</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {templates.map((template) => (
        <div
          key={template.id}
          className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
          onClick={() => onSelect(template)}
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              {getJobTypeIcon(template.jobType)}
            </div>
            <div>
              <h4 className="font-medium">{template.name}</h4>
              {template.description && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {template.description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-xs">
                  {getJobTypeLabel(template.jobType)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Created {formatDistanceToNow(new Date(template.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onRunTemplate(template);
            }}
            className="gap-2"
          >
            <Play className="h-3 w-3" />
            Run
          </Button>
        </div>
      ))}
    </div>
  );
};
