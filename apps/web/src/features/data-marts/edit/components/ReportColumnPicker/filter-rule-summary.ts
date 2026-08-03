import type { FilterRule } from '../../../shared/types/output-config';

/**
 * Returns a short human-readable value string for a FilterRule to display
 * alongside the operator label (e.g. "contains: foo").
 * Returns an empty string for no-value operators (is_empty, is_null, etc.).
 */
export function summarizeFilterRule(rule: FilterRule): string {
  switch (rule.operator) {
    case 'is_empty':
    case 'is_not_empty':
    case 'is_null':
    case 'is_not_null':
    case 'is_true':
    case 'is_false':
      return '';
    case 'between':
      return `${String(rule.value.from)} … ${String(rule.value.to)}`;
    case 'in':
    case 'not_in':
      return rule.value.map(String).join(', ');
    case 'relative_date': {
      const v = rule.value;
      if ('n' in v) return v.kind.replace('_n_', ` ${String(v.n)} `);
      return v.kind;
    }
    default:
      return JSON.stringify(rule.value);
  }
}
