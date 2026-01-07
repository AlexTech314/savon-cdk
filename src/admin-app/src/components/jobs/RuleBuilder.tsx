import React from 'react';
import { Rule, RuleGroup } from '@/types/jobs';
import { RuleRow } from './RuleRow';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Layers } from 'lucide-react';
import { createEmptyRule, createEmptyRuleGroup, isRuleGroup } from '@/lib/ruleEngine';
import { cn } from '@/lib/utils';

interface RuleBuilderProps {
  ruleGroup: RuleGroup;
  onChange: (ruleGroup: RuleGroup) => void;
  depth?: number;
}

export const RuleBuilder: React.FC<RuleBuilderProps> = ({
  ruleGroup,
  onChange,
  depth = 0,
}) => {
  const handleLogicChange = () => {
    onChange({
      ...ruleGroup,
      logic: ruleGroup.logic === 'AND' ? 'OR' : 'AND',
    });
  };

  const handleRuleChange = (index: number, updatedRule: Rule | RuleGroup) => {
    const newRules = [...ruleGroup.rules];
    newRules[index] = updatedRule;
    onChange({ ...ruleGroup, rules: newRules });
  };

  const handleRuleDelete = (index: number) => {
    if (ruleGroup.rules.length <= 1) return;
    const newRules = ruleGroup.rules.filter((_, i) => i !== index);
    onChange({ ...ruleGroup, rules: newRules });
  };

  const handleAddRule = () => {
    onChange({
      ...ruleGroup,
      rules: [...ruleGroup.rules, createEmptyRule()],
    });
  };

  const handleAddGroup = () => {
    onChange({
      ...ruleGroup,
      rules: [...ruleGroup.rules, createEmptyRuleGroup(ruleGroup.logic === 'AND' ? 'OR' : 'AND')],
    });
  };

  const handleDeleteGroup = () => {
    // Parent handles this - just emit empty if needed
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-border p-3 space-y-2',
        depth > 0 && 'ml-4 bg-muted/30'
      )}
    >
      {/* Group Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogicChange}
            className="h-7 px-3 font-mono text-xs"
          >
            {ruleGroup.logic}
          </Button>
          <span className="text-xs text-muted-foreground">
            Match {ruleGroup.logic === 'AND' ? 'all' : 'any'} of the following rules
          </span>
        </div>
        {depth === 0 && (
          <Badge variant="secondary" className="text-xs">
            {ruleGroup.rules.length} rule{ruleGroup.rules.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Rules */}
      <div className="space-y-2">
        {ruleGroup.rules.map((item, index) => (
          <React.Fragment key={isRuleGroup(item) ? item.id : item.id}>
            {index > 0 && (
              <div className="flex items-center gap-2 py-1">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs font-medium text-muted-foreground px-2">
                  {ruleGroup.logic}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}
            {isRuleGroup(item) ? (
              <div className="relative">
                <RuleBuilder
                  ruleGroup={item}
                  onChange={(updated) => handleRuleChange(index, updated)}
                  depth={depth + 1}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRuleDelete(index)}
                  className="absolute -right-2 -top-2 h-6 w-6 p-0 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive"
                  disabled={ruleGroup.rules.length <= 1}
                >
                  ×
                </Button>
              </div>
            ) : (
              <RuleRow
                rule={item}
                onChange={(updated) => handleRuleChange(index, updated)}
                onDelete={() => handleRuleDelete(index)}
                canDelete={ruleGroup.rules.length > 1}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Add Buttons */}
      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddRule}
          className="gap-1"
        >
          <Plus className="h-3 w-3" />
          Add Rule
        </Button>
        {depth < 2 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddGroup}
            className="gap-1"
          >
            <Layers className="h-3 w-3" />
            Add {ruleGroup.logic === 'AND' ? 'OR' : 'AND'} Group
          </Button>
        )}
      </div>
    </div>
  );
};
