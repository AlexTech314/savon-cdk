import React from 'react';
import { Rule, RuleOperator, RULE_FIELDS, RULE_OPERATORS, BUSINESS_TYPES, US_STATES } from '@/types/jobs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2, GripVertical } from 'lucide-react';

interface RuleRowProps {
  rule: Rule;
  onChange: (rule: Rule) => void;
  onDelete: () => void;
  canDelete: boolean;
}

export const RuleRow: React.FC<RuleRowProps> = ({
  rule,
  onChange,
  onDelete,
  canDelete,
}) => {
  const field = RULE_FIELDS.find((f) => f.key === rule.field);
  const operatorConfig = RULE_OPERATORS[rule.operator];
  const needsValue = operatorConfig?.needsValue ?? true;

  const handleFieldChange = (fieldKey: string) => {
    onChange({ ...rule, field: fieldKey, value: '' });
  };

  const handleOperatorChange = (operator: string) => {
    onChange({ ...rule, operator: operator as RuleOperator });
  };

  const handleValueChange = (value: string | number) => {
    onChange({ ...rule, value });
  };

  const getAvailableOperators = () => {
    if (!field) return Object.entries(RULE_OPERATORS);
    
    const typeOperators: Record<string, RuleOperator[]> = {
      text: ['equals', 'not_equals', 'contains', 'not_contains', 'is_null', 'is_not_null'],
      select: ['equals', 'not_equals', 'is_null', 'is_not_null'],
      number: ['equals', 'not_equals', 'greater_than', 'less_than', 'is_null', 'is_not_null'],
      boolean: ['equals', 'is_null', 'is_not_null'],
      date: ['equals', 'not_equals', 'greater_than', 'less_than', 'is_null', 'is_not_null'],
    };
    
    const allowed = typeOperators[field.type] || Object.keys(RULE_OPERATORS);
    return Object.entries(RULE_OPERATORS).filter(([key]) => allowed.includes(key as RuleOperator));
  };

  const renderValueInput = () => {
    if (!needsValue) return null;

    if (field?.type === 'select') {
      if (rule.field === 'business_type') {
        return (
          <Select value={String(rule.value || '')} onValueChange={handleValueChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select value" />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_TYPES.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      if (rule.field === 'state') {
        return (
          <Select value={String(rule.value || '')} onValueChange={handleValueChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map((state) => (
                <SelectItem key={state.code} value={state.code}>{state.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
    }

    if (field?.type === 'number') {
      return (
        <Input
          type="number"
          value={rule.value as number || ''}
          onChange={(e) => handleValueChange(Number(e.target.value))}
          placeholder="Enter value"
          className="w-[120px]"
        />
      );
    }

    if (field?.type === 'boolean') {
      return (
        <Select value={String(rule.value ?? 'true')} onValueChange={handleValueChange}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    return (
      <Input
        type="text"
        value={String(rule.value || '')}
        onChange={(e) => handleValueChange(e.target.value)}
        placeholder="Enter value"
        className="w-[180px]"
      />
    );
  };

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 group">
      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <Select value={rule.field} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Select field" />
        </SelectTrigger>
        <SelectContent>
          {RULE_FIELDS.map((f) => (
            <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={rule.operator} onValueChange={handleOperatorChange}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Select operator" />
        </SelectTrigger>
        <SelectContent>
          {getAvailableOperators().map(([key, config]) => (
            <SelectItem key={key} value={key}>{config.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {renderValueInput()}

      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={!canDelete}
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};
