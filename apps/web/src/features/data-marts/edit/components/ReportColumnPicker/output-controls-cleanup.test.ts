import { describe, expect, it } from 'vitest';
import type { FilterRule, OutputConfig } from '../../../shared/types/output-config';
import {
  isAggregatedShape,
  isSortResolvable,
  pruneRulesForDeselectedColumns,
  withoutHavingFiltersOrphanedBy,
  withoutUnresolvableSorts,
  type SortResolutionContext,
} from './output-controls-cleanup';

const NO_CALCULATED = { all: new Set<string>(), aggregate: new Set<string>() };
// `orders__unique_count` is a REAL column of the schema that happens to own a joined Unique Count
// output name — the case the blended builder mistakes for its own alias when unselected.
const KNOWN = new Set([
  'revenue',
  'orders',
  'country',
  'ordered_at',
  'clicks_x2',
  'ctr',
  'orders__unique_count',
]);

function config(overrides: Partial<OutputConfig> = {}): OutputConfig {
  return {
    filterConfig: [{ column: 'revenue', operator: 'gt', value: 0 }],
    sortConfig: [
      { column: 'revenue', direction: 'desc' },
      { column: 'country', direction: 'asc' },
    ],
    limitConfig: 100,
    aggregationConfig: [
      { column: 'revenue', function: 'SUM' },
      { column: 'orders', function: 'COUNT' },
    ],
    dateTruncConfig: [{ column: 'ordered_at', unit: 'MONTH' }],
    uniqueCountConfig: [],
    ...overrides,
  };
}

function plainConfig(overrides: Partial<OutputConfig> = {}): OutputConfig {
  return config({ aggregationConfig: [], dateTruncConfig: [], ...overrides });
}

function ctx(
  selected: Iterable<string>,
  overrides: Partial<Omit<SortResolutionContext, 'selectedNames'>> = {}
): SortResolutionContext {
  return {
    selectedNames: new Set(selected),
    hasExplicitColumns: true,
    knownNames: KNOWN,
    calculatedFields: NO_CALCULATED,
    uniqueCountOutputNames: new Set(),
    syntheticSortNames: new Set(),
    ...overrides,
  };
}

describe('isAggregatedShape', () => {
  it('is false for a plain filtered, sorted, limited report', () => {
    expect(isAggregatedShape(plainConfig(), new Set(['revenue']), new Set())).toBe(false);
  });

  it.each<[string, Partial<OutputConfig>]>([
    ['an aggregation', { aggregationConfig: [{ column: 'revenue', function: 'SUM' }] }],
    ['a date bucket', { dateTruncConfig: [{ column: 'ordered_at', unit: 'MONTH' }] }],
    ['a Unique Count', { uniqueCountConfig: [''] }],
  ])('is true with %s', (_shape, overrides) => {
    expect(isAggregatedShape(plainConfig(overrides), new Set(), new Set())).toBe(true);
  });

  it('is true when an aggregate-level calculated field is selected, or filtered on, and false for a row-level one', () => {
    const plain = plainConfig({ filterConfig: [] });
    const aggregate = new Set(['ctr']);

    expect(isAggregatedShape(plain, new Set(['ctr']), aggregate)).toBe(true);
    expect(
      isAggregatedShape(
        { ...plain, filterConfig: [{ column: 'ctr', operator: 'gt', value: 0 }] },
        new Set(),
        aggregate
      )
    ).toBe(true);
    // A row-level formula is a dimension: not in the aggregate set, so it does not group.
    expect(isAggregatedShape(plain, new Set(['clicks_x2']), aggregate)).toBe(false);
  });
});

describe('isSortResolvable', () => {
  const grouped = config();

  it('resolves a synthetic Unique Count metric in every shape, selected or not, in the schema or not', () => {
    const synthetic = ctx([], { syntheticSortNames: new Set(['Unique Count']) });
    expect(isSortResolvable('Unique Count', grouped, synthetic)).toBe(true);
    expect(isSortResolvable('Unique Count', plainConfig(), synthetic)).toBe(true);
  });

  it('never resolves a column the schema no longer offers, even a selected one', () => {
    expect(isSortResolvable('ghost', plainConfig(), ctx(['ghost']))).toBe(false);
  });

  it("never resolves a joined Data Mart's calculated field, selected or not", () => {
    const joined = ctx(['orders__roas'], {
      knownNames: new Set([...KNOWN, 'orders__roas']),
      joinedCalculatedNames: new Set(['orders__roas']),
    });
    expect(isSortResolvable('orders__roas', plainConfig(), joined)).toBe(false);
    expect(isSortResolvable('orders__roas', plainConfig(), ctx(['country'], joined))).toBe(false);
  });

  describe('with the implicit "all native columns" projection', () => {
    it('resolves a projected column of an ungrouped report and nothing else', () => {
      const implicit = ctx(['revenue'], { hasExplicitColumns: false });
      expect(isSortResolvable('revenue', plainConfig(), implicit)).toBe(true);
      expect(isSortResolvable('country', plainConfig(), implicit)).toBe(false);
    });

    it('resolves nothing once the projection is metrics-only (a Unique Count or an aggregation)', () => {
      const implicit = ctx(['revenue'], { hasExplicitColumns: false });
      const uniqueCountOnly = plainConfig({ uniqueCountConfig: [''] });
      expect(isSortResolvable('revenue', uniqueCountOnly, implicit)).toBe(false);
      const aggregated = plainConfig({
        aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
      });
      expect(isSortResolvable('revenue', aggregated, implicit)).toBe(false);
    });

    // The backend reads a grouped implicit projection as metrics-only ONLY for an aggregation or
    // a Unique Count; a report grouped by a filter on an aggregate-level formula alone keeps the
    // native set for its sort verdict (and is refused on save for wanting a column list).
    it('keeps resolving a projected column when only a calculated-field filter groups the report', () => {
      const implicit = ctx(['revenue'], {
        hasExplicitColumns: false,
        calculatedFields: { all: new Set(['ctr']), aggregate: new Set(['ctr']) },
      });
      const filteredByMetric = plainConfig({
        filterConfig: [{ column: 'ctr', operator: 'gt', value: 0 }],
      });
      expect(isSortResolvable('revenue', filteredByMetric, implicit)).toBe(true);
    });
  });

  describe('with an explicit projection', () => {
    it('resolves a selected column whatever the shape', () => {
      expect(isSortResolvable('orders', grouped, ctx(['orders']))).toBe(true);
      expect(isSortResolvable('orders', plainConfig(), ctx(['orders']))).toBe(true);
    });

    it('does not resolve an unselected column of a grouped report', () => {
      expect(isSortResolvable('country', grouped, ctx(['orders']))).toBe(false);
    });

    it('does not resolve an unselected calculated field of an ungrouped report', () => {
      const calculated = ctx(['country'], {
        calculatedFields: { all: new Set(['clicks_x2']), aggregate: new Set() },
      });
      expect(isSortResolvable('clicks_x2', plainConfig(), calculated)).toBe(false);
    });

    it('does not resolve an unselected real column that owns a Unique Count output name', () => {
      const shadowed = ctx(['country'], {
        uniqueCountOutputNames: new Set(['Unique Count', 'orders__unique_count']),
      });
      expect(isSortResolvable('orders__unique_count', plainConfig(), shadowed)).toBe(false);
    });

    it('resolves any other unselected schema column of an ungrouped report, like a filter', () => {
      expect(isSortResolvable('revenue', plainConfig(), ctx(['country']))).toBe(true);
    });
  });
});

describe('withoutUnresolvableSorts', () => {
  it('drops the sort on an unselected column once the config groups', () => {
    const only = plainConfig({ aggregationConfig: [{ column: 'revenue', function: 'SUM' }] });
    const { config: next, changed } = withoutUnresolvableSorts(only, ctx(['revenue']));

    expect(next.sortConfig).toEqual([{ column: 'revenue', direction: 'desc' }]);
    expect(changed).toEqual(['sortConfig']);
  });

  it('returns the same config when every sort resolves', () => {
    const plain = plainConfig();
    expect(withoutUnresolvableSorts(plain, ctx(['country']))).toEqual({
      config: plain,
      changed: [],
    });
    expect(withoutUnresolvableSorts(plain, ctx(['country'])).config).toBe(plain);
  });

  // Given the report as it was before the edit, only the rules the edit BROKE go: a rule that
  // was already unresolvable stays in plain view for the user, whatever unrelated click follows.
  it('leaves a rule that was already unresolvable before the edit alone', () => {
    const before = plainConfig({
      sortConfig: [
        { column: 'ghost', direction: 'asc' },
        { column: 'country', direction: 'asc' },
      ],
    });
    const grouped: OutputConfig = {
      ...before,
      aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
    };
    const context = ctx(['revenue']);

    const { config: next, changed } = withoutUnresolvableSorts(grouped, context, {
      config: before,
      ctx: context,
    });

    // `country` resolved on the ungrouped report and the aggregation broke it; `ghost` never did.
    expect(next.sortConfig).toEqual([{ column: 'ghost', direction: 'asc' }]);
    expect(changed).toEqual(['sortConfig']);
  });

  it('keeps a rule the edit did not break, and the same object when it broke none', () => {
    const before = plainConfig({ sortConfig: [{ column: 'ghost', direction: 'asc' }] });
    const edited = { ...before, filterConfig: [] };
    const context = ctx(['revenue']);

    const result = withoutUnresolvableSorts(edited, context, { config: before, ctx: context });

    expect(result.config).toBe(edited);
    expect(result.changed).toEqual([]);
  });
});

describe('withoutHavingFiltersOrphanedBy', () => {
  const having = (column: string, fn: 'SUM' | 'COUNT'): FilterRule => ({
    column,
    operator: 'gt',
    value: 100,
    function: fn,
  });

  it('drops only the HAVING filters whose aggregation the edit removed', () => {
    const before = plainConfig({
      aggregationConfig: [
        { column: 'revenue', function: 'SUM' },
        { column: 'orders', function: 'COUNT' },
      ],
      filterConfig: [
        having('revenue', 'SUM'),
        having('orders', 'COUNT'),
        // Already orphaned before the edit: not this edit's to remove.
        having('clicks_x2', 'SUM'),
        { column: 'revenue', operator: 'gt', value: 0 },
      ],
    });
    const after: OutputConfig = {
      ...before,
      aggregationConfig: [{ column: 'orders', function: 'COUNT' }],
    };

    const { config: next, changed } = withoutHavingFiltersOrphanedBy(before, after);

    expect(next.filterConfig).toEqual([
      having('orders', 'COUNT'),
      having('clicks_x2', 'SUM'),
      { column: 'revenue', operator: 'gt', value: 0 },
    ]);
    expect(changed).toEqual(['filterConfig']);
  });

  it('returns the same config when no aggregation left', () => {
    const before = plainConfig({ filterConfig: [having('revenue', 'SUM')] });
    const after: OutputConfig = { ...before, limitConfig: 5 };
    expect(withoutHavingFiltersOrphanedBy(before, after)).toEqual({ config: after, changed: [] });
  });
});

describe('pruneRulesForDeselectedColumns', () => {
  it('removes the aggregation and the date bucket on the unchecked columns and nothing else', () => {
    const { config: next, changed } = pruneRulesForDeselectedColumns(
      config(),
      new Set(['revenue', 'ordered_at']),
      ctx(['orders', 'country'])
    );

    expect(next.aggregationConfig).toEqual([{ column: 'orders', function: 'COUNT' }]);
    expect(next.dateTruncConfig).toEqual([]);
    // The report still aggregates (COUNT on orders), so the sort on revenue cannot resolve.
    expect(next.sortConfig).toEqual([{ column: 'country', direction: 'asc' }]);
    expect(next.filterConfig).toEqual(config().filterConfig);
    expect(next.limitConfig).toBe(100);
    expect(changed).toEqual(['aggregationConfig', 'dateTruncConfig', 'sortConfig']);
  });

  it('removes a HAVING filter with the aggregation it filters and keeps the row filter on the same column', () => {
    const rowFilter: FilterRule = { column: 'revenue', operator: 'gt', value: 0 };
    const havingOnRevenue: FilterRule = {
      column: 'revenue',
      operator: 'gt',
      value: 100,
      function: 'SUM',
    };
    const havingOnOrders: FilterRule = {
      column: 'orders',
      operator: 'gt',
      value: 1,
      function: 'COUNT',
    };
    const withHaving = config({
      dateTruncConfig: [],
      filterConfig: [rowFilter, havingOnRevenue, havingOnOrders],
      sortConfig: [{ column: 'country', direction: 'asc' }],
    });

    const { config: next, changed } = pruneRulesForDeselectedColumns(
      withHaving,
      new Set(['revenue']),
      ctx(['orders', 'country'])
    );

    expect(next.aggregationConfig).toEqual([{ column: 'orders', function: 'COUNT' }]);
    expect(next.filterConfig).toEqual([rowFilter, havingOnOrders]);
    expect(changed).toEqual(['aggregationConfig', 'filterConfig']);
  });

  it('keeps the sort on an unchecked column when the report no longer aggregates after the pruning', () => {
    const only = plainConfig({ aggregationConfig: [{ column: 'revenue', function: 'SUM' }] });
    const { config: next, changed } = pruneRulesForDeselectedColumns(
      only,
      new Set(['revenue']),
      ctx(['country'])
    );

    expect(next.aggregationConfig).toEqual([]);
    expect(next.sortConfig).toEqual(only.sortConfig);
    expect(changed).toEqual(['aggregationConfig']);
  });

  it('keeps the sort on an unchecked column of a plain report', () => {
    const plain = plainConfig();
    const result = pruneRulesForDeselectedColumns(plain, new Set(['revenue']), ctx(['country']));

    expect(result.config).toBe(plain);
    expect(result.changed).toEqual([]);
  });

  // A disconnected row being unchecked: the column is gone from the schema, so a sort on it can
  // never resolve, whatever the report's shape — leaving it would fail the very next save.
  it('always removes the sort on an unchecked column that the schema no longer offers', () => {
    const plain = plainConfig({
      sortConfig: [
        { column: 'ghost', direction: 'asc' },
        { column: 'country', direction: 'asc' },
      ],
    });
    const { config: next, changed } = pruneRulesForDeselectedColumns(
      plain,
      new Set(['ghost']),
      ctx(['country'])
    );

    expect(next.sortConfig).toEqual([{ column: 'country', direction: 'asc' }]);
    expect(changed).toEqual(['sortConfig']);
  });

  it('always removes the sort on an unchecked calculated field', () => {
    const plain = plainConfig({ sortConfig: [{ column: 'clicks_x2', direction: 'asc' }] });
    const { config: next, changed } = pruneRulesForDeselectedColumns(
      plain,
      new Set(['clicks_x2']),
      ctx(['country'], {
        calculatedFields: { all: new Set(['clicks_x2']), aggregate: new Set() },
      })
    );

    expect(next.sortConfig).toEqual([]);
    expect(changed).toEqual(['sortConfig']);
  });

  it('always removes the sort on an unchecked real column that owns a Unique Count output name', () => {
    const plain = plainConfig({
      sortConfig: [{ column: 'orders__unique_count', direction: 'asc' }],
    });
    const { config: next, changed } = pruneRulesForDeselectedColumns(
      plain,
      new Set(['orders__unique_count']),
      ctx(['country'], {
        uniqueCountOutputNames: new Set(['Unique Count', 'orders__unique_count']),
      })
    );

    expect(next.sortConfig).toEqual([]);
    expect(changed).toEqual(['sortConfig']);
  });

  it('removes the sort on an unchecked column while a selected aggregate-level calculated field still groups the report', () => {
    const { config: next, changed } = pruneRulesForDeselectedColumns(
      plainConfig(),
      new Set(['revenue']),
      ctx(['ctr', 'country'], {
        calculatedFields: { all: new Set(['ctr']), aggregate: new Set(['ctr']) },
      })
    );

    expect(next.sortConfig).toEqual([{ column: 'country', direction: 'asc' }]);
    expect(changed).toEqual(['sortConfig']);
  });

  it('leaves a HAVING filter that was already orphaned alone when an unrelated column is unchecked', () => {
    const staleHaving: FilterRule = {
      column: 'revenue',
      operator: 'gt',
      value: 100,
      function: 'SUM',
    };
    const stale = plainConfig({
      aggregationConfig: [{ column: 'orders', function: 'COUNT' }],
      filterConfig: [staleHaving],
      sortConfig: [],
    });

    const result = pruneRulesForDeselectedColumns(
      stale,
      new Set(['country']),
      ctx(['orders', 'revenue'])
    );

    expect(result.config).toBe(stale);
    expect(result.changed).toEqual([]);
  });

  it('leaves a pre-existing orphan sort on another column alone when a column is unchecked', () => {
    const stale = plainConfig({
      aggregationConfig: [
        { column: 'revenue', function: 'SUM' },
        { column: 'orders', function: 'COUNT' },
      ],
      sortConfig: [
        { column: 'ghost', direction: 'asc' },
        { column: 'revenue', direction: 'desc' },
      ],
    });

    const { config: next, changed } = pruneRulesForDeselectedColumns(
      stale,
      new Set(['revenue']),
      ctx(['orders'])
    );

    // The uncheck took SUM(revenue) and, since COUNT(orders) keeps the report grouped, the sort on
    // `revenue` with it; the sort on `ghost` was orphaned before the uncheck and is not this
    // edit's to remove.
    expect(next.aggregationConfig).toEqual([{ column: 'orders', function: 'COUNT' }]);
    expect(next.sortConfig).toEqual([{ column: 'ghost', direction: 'asc' }]);
    expect(changed).toEqual(['aggregationConfig', 'sortConfig']);
  });

  it('returns the same config when nothing was unchecked', () => {
    const same = config();
    expect(pruneRulesForDeselectedColumns(same, new Set(), ctx(['revenue']))).toEqual({
      config: same,
      changed: [],
    });
  });
});
