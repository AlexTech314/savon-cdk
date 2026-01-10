import React from 'react';
import { JobConfig, PLACE_TYPES, RULE_FIELDS, RULE_OPERATORS } from '@/types/jobs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Search, FileText, Hash, Clock, Filter } from 'lucide-react';

interface JobConfigSummaryProps {
  config: JobConfig;
}

export const JobConfigSummary: React.FC<JobConfigSummaryProps> = ({ config }) => {
  const getEstimatedTime = () => {
    let records = 0;
    if (config.placesConfig) {
      const validSearches = config.placesConfig.searches.filter(s => s.textQuery.trim());
      const maxResults = config.placesConfig.maxResultsPerSearch ?? 60;
      records += validSearches.length * maxResults;
    }
    if (config.copyConfig) {
      records += 50; // Mock estimate for copy processing
    }
    const minutes = Math.ceil(records / 15);
    return `~${minutes} minutes for up to ${records} records`;
  };

  const jobTypeLabels = {
    places: 'Google Places Search',
    copy: 'Generate LLM Copy',
    both: 'Full Pipeline (Places → Copy)',
  };

  const getPlaceTypeLabel = (value: string) => {
    return PLACE_TYPES.find(t => t.value === value)?.label || value;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-sm px-3 py-1">
          {jobTypeLabels[config.jobType]}
        </Badge>
      </div>

      {config.placesConfig && (
        <Card className="card-gradient border-border">
          <CardContent className="pt-4 space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Places Search Configuration
            </h4>
            
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Search className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <span className="text-muted-foreground">Search Queries: </span>
                  <div className="space-y-1.5 mt-1">
                    {config.placesConfig.searches
                      .filter(s => s.textQuery.trim())
                      .map((search, index) => (
                        <div key={index} className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs font-mono">
                            "{search.textQuery}"
                          </Badge>
                          {search.includedType && (
                            <Badge variant="secondary" className="text-xs">
                              {getPlaceTypeLabel(search.includedType)}
                            </Badge>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Max results per search: </span>
                <span className="font-medium">{config.placesConfig.maxResultsPerSearch ?? 60}</span>
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Filter: </span>
                <span className="font-medium">
                  {config.placesConfig.onlyWithoutWebsite !== false
                    ? 'Only businesses without websites'
                    : 'All businesses'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {config.copyConfig && (
        <Card className="card-gradient border-border">
          <CardContent className="pt-4 space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Copy Generation Configuration
            </h4>
            
            <div className="text-sm">
              <span className="text-muted-foreground">Filter Rules:</span>
              <div className="mt-2 p-3 rounded-lg bg-muted/50 font-mono text-xs whitespace-pre-wrap">
                {formatRulesForDisplay(config.copyConfig.rules)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-accent/30 bg-accent/10">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-accent" />
            <span className="text-muted-foreground">Estimated time: </span>
            <span className="font-medium text-accent">{getEstimatedTime()}</span>
          </div>
        </CardContent>
      </Card>

      {config.templateName && (
        <p className="text-sm text-muted-foreground">
          This configuration will be saved as template: <strong>{config.templateName}</strong>
        </p>
      )}
    </div>
  );
};

function formatRulesForDisplay(group: any, indent = 0): string {
  const prefix = '  '.repeat(indent);
  const lines: string[] = [];

  group.rules.forEach((item: any, index: number) => {
    if (item.rules) {
      lines.push(`${prefix}(`);
      lines.push(formatRulesForDisplay(item, indent + 1));
      lines.push(`${prefix})`);
    } else {
      const field = RULE_FIELDS.find((f) => f.key === item.field)?.label || item.field;
      const operator = RULE_OPERATORS[item.operator]?.label || item.operator;
      const value = item.value !== undefined ? ` "${item.value}"` : '';
      lines.push(`${prefix}${field} ${operator}${value}`);
    }
    if (index < group.rules.length - 1) {
      lines.push(`${prefix}${group.logic}`);
    }
  });

  return lines.join('\n');
}
