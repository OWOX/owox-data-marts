import { filtersAndRestrictionOf } from './having-group-by.util';
import { routeFilterClauses } from '../calculated-fields/filter-clause-routing';
import { isCalculatedGroupingKey } from '../calculated-fields/calculated-plan-grain';
import type { DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import type { ReportLikeReadPlan } from '../dto/domain/report-like-read-plan';
import type { RoutedGroupRestriction } from '../dto/domain/group-restriction';
import type { FilterRule } from '../dto/schemas/filter-config.schema';

describe('filtersAndRestrictionOf', () => {
  const fields = [
    { name: 'date', type: 'DATE', status: 'CONNECTED' },
    { name: 'status', type: 'STRING', status: 'CONNECTED' },
    { name: 'country', type: 'STRING', status: 'CONNECTED' },
    { name: 'revenue', type: 'FLOAT', status: 'CONNECTED' },
    { name: 'clicks', type: 'INTEGER', status: 'CONNECTED' },
    { name: 'impressions', type: 'INTEGER', status: 'CONNECTED' },
    {
      name: 'session_key',
      type: 'STRING',
      status: 'CONNECTED',
      calculated: {
        formula: 'CONCAT({{ref field="status"}}, {{ref field="country"}})',
        level: 'column',
      },
    },
    {
      name: 'net',
      type: 'FLOAT',
      status: 'CONNECTED',
      calculated: { formula: '{{ref field="revenue"}} * 2', level: 'column' },
    },
    {
      name: 'ctr',
      type: 'FLOAT',
      status: 'CONNECTED',
      calculated: {
        formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
        level: 'metric',
      },
    },
  ] as unknown as DataMartSchemaField[];

  const where: FilterRule = { column: 'country', operator: 'eq', value: 'UA' };
  const having: FilterRule = { column: 'revenue', function: 'SUM', operator: 'gt', value: 100 };

  const plan = (overrides: Partial<ReportLikeReadPlan>): ReportLikeReadPlan =>
    ({ dataMart: { schema: { fields } }, ...overrides }) as unknown as ReportLikeReadPlan;

  it('returns the routed rules and no restriction for a plain read', () => {
    const result = filtersAndRestrictionOf(plan({ filterConfig: [where, having] }), fields);

    expect(result.filters).toEqual(routeFilterClauses([where, having], fields));
    expect(result.groupRestriction).toBeUndefined();
  });

  it("returns the plan's own restriction unchanged", () => {
    const restriction: RoutedGroupRestriction = {
      dimensions: ['country'],
      having: [{ ...having, clause: 'having' }],
    };

    const result = filtersAndRestrictionOf(
      plan({ filterConfig: [where], groupRestriction: restriction }),
      fields
    );

    expect(result.filters).toEqual([{ ...where, clause: 'where' }]);
    expect(result.groupRestriction).toBe(restriction);
  });

  it('throws when a plan carries both havingGroupBy and groupRestriction', () => {
    const report = plan({
      filterConfig: [having],
      havingGroupBy: { column: ['status'] },
      groupRestriction: { dimensions: ['country'], having: [{ ...having, clause: 'having' }] },
    });

    expect(() => filtersAndRestrictionOf(report, fields)).toThrow(Error);
  });

  it('moves the metric filters to a restriction at the havingGroupBy grain', () => {
    const month = { column: 'date', unit: 'MONTH' as const };

    const result = filtersAndRestrictionOf(
      plan({
        filterConfig: [where, having],
        havingGroupBy: { column: ['status', 'date'], dateTrunc: [month] },
      }),
      fields
    );

    expect(result.filters).toEqual([{ ...where, clause: 'where' }]);
    expect(result.groupRestriction).toEqual({
      dimensions: ['status', 'date'],
      dateTruncs: [month],
      having: [{ ...having, clause: 'having' }],
    });
    expect(result.groupRestriction?.calculatedDimensions).toBeUndefined();
    expect(result.groupRestriction?.calculatedHavingMetrics).toBeUndefined();
  });

  it('builds no restriction when no rule routes to HAVING', () => {
    const result = filtersAndRestrictionOf(
      plan({ filterConfig: [where], havingGroupBy: { column: ['status'] } }),
      fields
    );

    expect(result.filters).toEqual([{ ...where, clause: 'where' }]);
    expect(result.groupRestriction).toBeUndefined();
  });

  it('keeps a row-level calculated key a key when the read aggregates it', () => {
    const result = filtersAndRestrictionOf(
      plan({
        filterConfig: [having],
        aggregationConfig: [{ column: 'session_key', function: 'COUNT_DISTINCT' }],
        havingGroupBy: { column: ['session_key'] },
      }),
      fields
    );

    const keys = result.groupRestriction?.calculatedDimensions ?? [];
    expect(keys).toEqual([expect.objectContaining({ outputName: 'session_key', level: 'column' })]);
    expect(keys.every(isCalculatedGroupingKey)).toBe(true);
  });

  it("builds the plan of a row-level metric filter with the read's aggregations", () => {
    const result = filtersAndRestrictionOf(
      plan({
        filterConfig: [{ column: 'net', function: 'SUM', operator: 'gt', value: 10 }],
        aggregationConfig: [{ column: 'net', function: 'SUM' }],
        havingGroupBy: { column: ['status'] },
      }),
      fields
    );

    expect(result.groupRestriction?.calculatedHavingMetrics).toEqual([
      expect.objectContaining({ outputName: 'net', isAggregatedByReport: true }),
    ]);
  });

  it('moves a filter on an aggregate-level calculated field to the restriction', () => {
    const ctrRule: FilterRule = { column: 'ctr', operator: 'gt', value: 0.1 };

    const result = filtersAndRestrictionOf(
      plan({ filterConfig: [where, ctrRule], havingGroupBy: { column: ['status'] } }),
      fields
    );

    expect(result.filters).toEqual([{ ...where, clause: 'where' }]);
    expect(result.groupRestriction?.having).toEqual([{ ...ctrRule, clause: 'having' }]);
  });
});
