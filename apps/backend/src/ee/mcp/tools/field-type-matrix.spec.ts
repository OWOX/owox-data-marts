import {
  FIELD_TYPE_CATEGORIES,
  MCP_TO_INTERNAL_OPERATOR,
  buildFieldTypeMatrixSection,
  effectiveMcpAggregations,
  mcpDefaultAggregationsForCategory,
  mcpOperatorNamesForInternal,
  mcpOperatorsForCategory,
  mcpSupportedAggregationsForCategory,
} from './field-type-matrix';
import {
  MCP_AGGREGATE_FUNCTIONS,
  SUPPORTED_MCP_OPERATORS,
  mapMcpFiltersToRules,
} from './query-data-mart.input';
import { INTERNAL_OPERATORS_BY_CATEGORY } from '../../../data-marts/dto/schemas/field-type-category';

/** A value each MCP operator accepts, so mapOne can run without validation errors. */
function dummyValueFor(op: string): unknown {
  if (op === 'between') return { from: 1, to: 2 };
  if (op === 'in' || op === 'not_in') return ['v'];
  if (op === 'in_last_n_days' || op === 'in_next_n_days') return 7;
  if (op === 'is_null' || op === 'is_not_null' || op === 'is_empty' || op === 'is_not_empty') {
    return undefined;
  }
  if (op.startsWith('this_') || op.startsWith('last_')) return undefined;
  return 'v';
}

describe('field-type-matrix', () => {
  it('MCP_TO_INTERNAL_OPERATOR matches what the filter mapper actually produces', () => {
    for (const op of SUPPORTED_MCP_OPERATORS) {
      const rules = mapMcpFiltersToRules(
        [],
        [{ field: 'f', operator: op, value: dummyValueFor(op) }]
      );
      expect(rules).not.toBeNull();
      expect({ op, internal: rules![0].operator }).toEqual({
        op,
        internal: MCP_TO_INTERNAL_OPERATOR[op],
      });
    }
  });

  it('covers every supported MCP operator in the map, and nothing else', () => {
    expect(Object.keys(MCP_TO_INTERNAL_OPERATOR).sort()).toEqual(
      [...SUPPORTED_MCP_OPERATORS].sort()
    );
  });

  it('boolean eq/neq advertised because the mapper translates them to is_true/is_false', () => {
    const eqTrue = mapMcpFiltersToRules([], [{ field: 'f', operator: 'eq', value: true }]);
    const neqTrue = mapMcpFiltersToRules([], [{ field: 'f', operator: 'neq', value: true }]);
    expect(eqTrue![0].operator).toBe('is_true');
    expect(neqTrue![0].operator).toBe('is_false');
    // The translated operators are legal for boolean columns in the validator's own set.
    expect(INTERNAL_OPERATORS_BY_CATEGORY.boolean.has('is_true')).toBe(true);
    expect(INTERNAL_OPERATORS_BY_CATEGORY.boolean.has('is_false')).toBe(true);
    expect(mcpOperatorsForCategory('boolean')).toEqual(['eq', 'neq', 'is_null', 'is_not_null']);
  });

  it('every non-boolean advertised operator is legal in the validator operator sets', () => {
    for (const category of FIELD_TYPE_CATEGORIES) {
      if (category === 'boolean') continue;
      for (const op of mcpOperatorsForCategory(category)) {
        expect({
          category,
          op,
          allowed: INTERNAL_OPERATORS_BY_CATEGORY[category].has(MCP_TO_INTERNAL_OPERATOR[op]),
        }).toEqual({ category, op, allowed: true });
      }
    }
  });

  it('derives the expected per-category operator lists', () => {
    expect(mcpOperatorsForCategory('number')).toEqual(
      expect.arrayContaining(['eq', 'gt', 'between', 'in', 'not_in'])
    );
    expect(mcpOperatorsForCategory('number')).not.toEqual(expect.arrayContaining(['contains']));
    expect(mcpOperatorsForCategory('string')).toEqual(
      expect.arrayContaining(['contains', 'starts_with', 'in', 'not_in', 'is_empty'])
    );
    expect(mcpOperatorsForCategory('string')).not.toEqual(expect.arrayContaining(['gt']));
    expect(mcpOperatorsForCategory('date')).toEqual(
      expect.arrayContaining([
        'before',
        'after',
        'in_last_n_days',
        'in_next_n_days',
        'this_week',
        'last_week',
        'this_month',
        'this_quarter',
        'last_quarter',
        'this_year',
        'in',
      ])
    );
    // TIME columns have no relative-date presets.
    expect(mcpOperatorsForCategory('time')).not.toEqual(expect.arrayContaining(['in_last_n_days']));
    // is_empty/is_not_empty are string-only.
    expect(mcpOperatorsForCategory('number')).not.toEqual(expect.arrayContaining(['is_empty']));
    expect(mcpOperatorsForCategory('other')).toEqual(['is_null', 'is_not_null']);
  });

  it('aggregation menus stay within the MCP function set, defaults within the menu', () => {
    for (const category of FIELD_TYPE_CATEGORIES) {
      const supported = mcpSupportedAggregationsForCategory(category);
      const defaults = mcpDefaultAggregationsForCategory(category);
      for (const fn of supported) expect(MCP_AGGREGATE_FUNCTIONS).toContain(fn);
      for (const fn of defaults) expect(supported).toContain(fn);
    }
    // The two documented surprises: percentiles are opt-in, COUNT is absent for numbers.
    expect(mcpDefaultAggregationsForCategory('number')).toEqual(['SUM', 'AVG', 'MIN', 'MAX']);
    expect(mcpSupportedAggregationsForCategory('number')).not.toEqual(
      expect.arrayContaining(['COUNT'])
    );
  });

  it('effectiveMcpAggregations resolves defaults and narrows by explicit override', () => {
    expect(effectiveMcpAggregations('FLOAT')).toEqual(['SUM', 'AVG', 'MIN', 'MAX']);
    expect(effectiveMcpAggregations('FLOAT', { allowedAggregations: ['SUM', 'P95'] })).toEqual([
      'SUM',
      'P95',
    ]);
    // STRING_AGG is a valid report function but not an MCP one — filtered out.
    expect(
      effectiveMcpAggregations('STRING', { allowedAggregations: ['COUNT', 'STRING_AGG'] })
    ).toEqual(['COUNT']);
  });

  it('maps internal operators back to the MCP names that produce them', () => {
    expect(mcpOperatorNamesForInternal('relative_date')).toEqual(
      expect.arrayContaining([
        'in_last_n_days',
        'in_next_n_days',
        'this_week',
        'last_week',
        'this_month',
        'this_quarter',
        'last_quarter',
        'this_year',
      ])
    );
    expect(mcpOperatorNamesForInternal('lt').sort()).toEqual(['before', 'lt']);
    expect(mcpOperatorNamesForInternal('eq')).toEqual(['eq']);
    // Unknown/unmapped internal names yield an empty list (caller falls back to the raw name).
    expect(mcpOperatorNamesForInternal('is_true')).toEqual([]);
  });

  it('renders one matrix line per category for the tool description', () => {
    const section = buildFieldTypeMatrixSection();
    for (const category of FIELD_TYPE_CATEGORIES) {
      expect(section).toContain(`- ${category} (`);
    }
    expect(section).toContain('only where enabled on the field');
    expect(section).toContain('boolean true or false');
  });
});
