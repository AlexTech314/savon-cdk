import React from 'react';
import { JobConfig, BUSINESS_TYPES, US_STATES, RULE_FIELDS, RULE_OPERATORS } from '@/types/jobs';
import { isRuleGroup, ruleGroupToHumanReadable } from '@/lib/ruleEngine';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Building2, FileText, Hash, Clock } from 'lucide-react';

interface JobConfigSummaryProps {
  config: JobConfig;
}

export const JobConfigSummary: React.FC<JobConfigSummaryProps> = ({ config }) => {
  const getEstimatedTime = () => {
    let records = 0;
    if (config.placesConfig) {
      records += config.placesConfig.businessTypes.length * 
                 config.placesConfig.states.length * 
                 config.placesConfig.countPerType;
    }
    if (config.copyConfig) {
      records += 50; // Mock estimate for copy processing
    }
    const minutes = Math.ceil(records / 15);
    return `~${minutes} minutes for ${records} records`;
  };

  const jobTypeLabels = {
    places: 'Google Places Search',
    copy: 'Generate LLM Copy',
    both: 'Full Pipeline (Places → Copy)',
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
            
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <span className="text-muted-foreground">Business Types: </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {config.placesConfig.businessTypes.map((type) => (
                      <Badge key={type} variant="outline" className="text-xs">
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <span className="text-muted-foreground">States: </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {config.placesConfig.states.map((code) => {
                      const state = US_STATES.find((s) => s.code === code);
                      return (
                        <Badge key={code} variant="outline" className="text-xs">
                          {state?.name || code}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Results per type: </span>
                <span className="font-medium">{config.placesConfig.countPerType}</span>
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
