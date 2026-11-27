import type { ReportAggregateFunction } from '../dto/schemas/aggregate-function.schema';
import {
  classifyFormulaRollup,
  rollupAggregationsOfClass,
  type RollupClass,
  type RollupClassifyOptions,
} from './rollup-aggregations';

// `j.a` and `j.revenue` are joined tags; every other listed name is an own tag.
const tagged = (formula: string) =>
  formula.replace(/\bj\.(?:a|revenue)\b|\b(?:a|b|c|s|revenue|cost|orders|other_field)\b/g, name =>
    name.startsWith('j.') ? `{{ref path="j" field="${name.slice(2)}"}}` : `{{ref field="${name}"}}`
  );

const OWN_CLASSES: Record<string, RollupClass> = {
  revenue: 'nullableSum',
  cost: 'nullableSum',
  orders: 'neverNullSum',
};

const optionsWith = (integerDivisionTruncates: boolean): RollupClassifyOptions => ({
  integerDivisionTruncates,
  classifyOwnReference: field => OWN_CLASSES[field] ?? 'other',
});

const rollupOf = (formula: string, integerDivisionTruncates = false) =>
  rollupAggregationsOfClass(classifyFormulaRollup(formula, optionsWith(integerDivisionTruncates)));

describe('classifyFormulaRollup', () => {
  it.each<[string, ReportAggregateFunction[]]>([
    ['SUM(a)', ['SUM']],
    ['COUNT(a)', ['SUM']],
    ["SUM(IF(s = 'paid', a, 0))", ['SUM']],
    ['COUNT(a) + COUNT(b)', ['SUM']],
    ['SUM(a) / 100', ['SUM']],
    ['0.01 * SUM(a)', ['SUM']],
    ['-SUM(a)', ['SUM']],
    ['-(SUM(a))', ['SUM']],
    ['+SUM(a)', ['SUM']],
    ['( SUM(a) ) -- note', ['SUM']],
    ['-- note\nSUM(a)', ['SUM']],
    ['/* c */ SUM(a)', ['SUM']],
    ['sum(a)', ['SUM']],
    ['COALESCE(SUM(a), 0) - COALESCE(SUM(b), 0)', ['SUM']],
    ['COALESCE(SUM(a), 0) - COUNT(c)', ['SUM']],
    ['orders - orders', ['SUM']],
    ['MIN(a)', ['MIN']],
    ['MAX(a)', ['MAX']],
    // A group where one `SUM` term is NULL loses the other term's value.
    ['SUM(a) + SUM(b)', []],
    ['SUM(a) + SUM(b) - COUNT(c)', []],
    ['SUM(a) - COUNT(c)', []],
    ['revenue - cost', []],
    ['COALESCE(SUM(a) + SUM(b), 0)', []],
    ['SUM(a) * SUM(b)', []],
    ['SUM(a) - 1', []],
    ['SUM(a) / SUM(b)', []],
    ['SUM(a) / NULLIF(SUM(b), 0)', []],
    ['AVG(a)', []],
    ['COUNT(DISTINCT a)', []],
    ['SUM(DISTINCT a)', []],
    ['APPROX_COUNT_DISTINCT(a)', []],
    ['COUNTIF(a > 0)', []],
    ['SUM(a) + 1', []],
    ['MIN(a) + MIN(b)', []],
    ['2 * MAX(a)', []],
    ['ROUND(SUM(a), 2)', []],
    ['COALESCE(SUM(a), 1)', []],
    ['COALESCE(MAX(a), 0)', []],
    ['MAX(a, 5)', []],
    ['SUM(a HAVING MAX b)', []],
    ['SUM(a ORDER BY b)', []],
    ['SUM(a WHERE b > 0)', []],
    ['SUM(a LIMIT 1)', []],
    ['SUM(a GROUP BY b)', []],
    ['SUM(j.a)', []],
    // The stub classifies `revenue` as a sum, so these prove a joined tag never reaches it.
    ['j.revenue', []],
    ['j.revenue - cost', []],
    ['other_field', []],
    ["SUM(a) || 'x'", []],
    ["SUM(a) + 'x'", []],
    ['CASE WHEN SUM(a) > 0 THEN 1 END', []],
  ])('%s gives %j', (formula, expected) => {
    expect(rollupOf(tagged(formula))).toEqual(expected);
  });

  // Athena and Redshift truncate `INTEGER / INTEGER` per group, so the group values no longer add up.
  it('refuses a division where integer division truncates', () => {
    expect(rollupOf(tagged('SUM(a) / 100'), true)).toEqual([]);
    expect(rollupOf(tagged('revenue / 2'), true)).toEqual([]);
    expect(rollupOf(tagged('SUM(a) / SUM(b)'), true)).toEqual([]);
  });

  it('keeps a multiplication where integer division truncates', () => {
    expect(rollupOf(tagged('0.01 * SUM(a)'), true)).toEqual(['SUM']);
  });

  it('reads a formula whose tag does not parse as one that no function combines', () => {
    expect(rollupOf('SUM({{ref field=}})')).toEqual([]);
  });

  // Close to the formula length limit, the parentheses nest deeper than the call stack holds.
  it('does not throw for parentheses nested near the formula length limit', () => {
    const nested = '('.repeat(4_900) + tagged('SUM(a)') + ')'.repeat(4_900);

    expect(() => rollupOf(nested)).not.toThrow();
  });
});
