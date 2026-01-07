import { Rule, RuleGroup, RuleOperator } from '@/types/jobs';

export const createEmptyRule = (): Rule => ({
  id: crypto.randomUUID(),
  field: 'name',
  operator: 'contains',
  value: '',
});

export const createEmptyRuleGroup = (logic: 'AND' | 'OR' = 'AND'): RuleGroup => ({
  id: crypto.randomUUID(),
  logic,
  rules: [createEmptyRule()],
});

export const isRuleGroup = (item: Rule | RuleGroup): item is RuleGroup => {
  return 'logic' in item && 'rules' in item;
};

export const evaluateRule = (record: Record<string, any>, rule: Rule): boolean => {
  const fieldValue = record[rule.field];
  const ruleValue = rule.value;

  switch (rule.operator) {
    case 'equals':
      return fieldValue === ruleValue;
    case 'not_equals':
      return fieldValue !== ruleValue;
    case 'contains':
      return String(fieldValue || '').toLowerCase().includes(String(ruleValue || '').toLowerCase());
    case 'not_contains':
      return !String(fieldValue || '').toLowerCase().includes(String(ruleValue || '').toLowerCase());
    case 'is_null':
      return fieldValue === null || fieldValue === undefined || fieldValue === '';
    case 'is_not_null':
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
    case 'greater_than':
      return Number(fieldValue) > Number(ruleValue);
    case 'less_than':
      return Number(fieldValue) < Number(ruleValue);
    default:
      return true;
  }
};

export const evaluateRuleGroup = (record: Record<string, any>, group: RuleGroup): boolean => {
  const results = group.rules.map((item) => {
    if (isRuleGroup(item)) {
      return evaluateRuleGroup(record, item);
    }
    return evaluateRule(record, item);
  });

  if (group.logic === 'AND') {
    return results.every(Boolean);
  }
  return results.some(Boolean);
};

export const ruleGroupToHumanReadable = (group: RuleGroup, indent = 0): string => {
  const prefix = '  '.repeat(indent);
  const lines: string[] = [];

  group.rules.forEach((item, index) => {
    if (isRuleGroup(item)) {
      lines.push(`${prefix}(${ruleGroupToHumanReadable(item, indent + 1)})`);
    } else {
      const operator = getOperatorLabel(item.operator);
      const value = item.value !== undefined ? ` "${item.value}"` : '';
      lines.push(`${prefix}${item.field} ${operator}${value}`);
    }
    if (index < group.rules.length - 1) {
      lines.push(`${prefix}${group.logic}`);
    }
  });

  return lines.join('\n');
};

const getOperatorLabel = (operator: RuleOperator): string => {
  const labels: Record<RuleOperator, string> = {
    equals: '=',
    not_equals: '≠',
    contains: 'contains',
    not_contains: 'does not contain',
    is_null: 'is empty',
    is_not_null: 'is not empty',
    greater_than: '>',
    less_than: '<',
  };
  return labels[operator];
};

export const countMatchingRecords = (records: Record<string, any>[], group: RuleGroup): number => {
  return records.filter((record) => evaluateRuleGroup(record, group)).length;
};
