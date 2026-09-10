import { describe, expect, it } from 'vitest';
import type { OutputConfig } from '../../../shared/types/output-config';
import { isAggregatedShape, pruneRulesForDeselectedColumns } from './output-controls-cleanup';

const NO_CALCULATED = { all: new Set<string>(), aggregate: new Set<string>() };
const KNOWN = new Set(['revenue', 'orders', 'country', 'ordered_at', 'clicks_x2', 'ctr']);

function config(overrides: Partial<OutputConfig> = {}): OutputConfig {
  return {
    filterConfig: [{ column: 'revenue', operator: 'gt', value: 0 }] as never,
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

describe('isAggregatedShape', () => {
  it('is false for a plain filtered, sorted, limited report', () => {
    const plain = config({ aggregationConfig: [], dateTruncConfig: [] });
    expect(isAggregatedShape(plain, new Set(['revenue']), new Set())).toBe(false);
  });

  it.each<[string, Partial<OutputConfig>]>([
    ['an aggregation', { aggregationConfig: [{ column: 'revenue', function: 'SUM' }] }],
    ['a date bucket', { dateTruncConfig: [{ column: 'ordered_at', unit: 'MONTH' }] }],
    ['a Unique Count', { uniqueCountConfig: [''] }],
  ])('is true with %s', (_shape, overrides) => {
    const shaped = config({ aggregationConfig: [], dateTruncConfig: [], ...overrides });
    expect(isAggregatedShape(shaped, new Set(), new Set())).toBe(true);
  });

  it('is true when an aggregate-level calculated field is selected, or filtered on, and false for a row-level one', () => {
    const plain = config({ aggregationConfig: [], dateTruncConfig: [], filterConfig: [] });
    const aggregate = new Set(['ctr']);

    expect(isAggregatedShape(plain, new Set(['ctr']), aggregate)).toBe(true);
    expect(
      isAggregatedShape(
        { ...plain, filterConfig: [{ column: 'ctr', operator: 'gt', value: 0 }] as never },
        new Set(),
        aggregate
      )
    ).toBe(true);
    // A row-level formula is a dimension: not in the aggregate set, so it does not group.
    expect(isAggregatedShape(plain, new Set(['clicks_x2']), aggregate)).toBe(false);
  });
});

describe('pruneRulesForDeselectedColumns', () => {
  it('removes the aggregation and the date bucket on the unchecked columns and nothing else', () => {
    const { config: next, changed } = pruneRulesForDeselectedColumns(
      config(),
      new Set(['revenue', 'ordered_at']),
      {
        selectedNames: new Set(['orders', 'country']),
        knownNames: KNOWN,
        calculatedFields: NO_CALCULATED,
      }
    );

    expect(next.aggregationConfig).toEqual([{ column: 'orders', function: 'COUNT' }]);
    expect(next.dateTruncConfig).toEqual([]);
    // The report still aggregates (COUNT on orders), so the sort on revenue cannot resolve.
    expect(next.sortConfig).toEqual([{ column: 'country', direction: 'asc' }]);
    expect(next.filterConfig).toEqual(config().filterConfig);
    expect(next.limitConfig).toBe(100);
    expect(changed).toEqual(['aggregationConfig', 'dateTruncConfig', 'sortConfig']);
  });

  it('keeps the sort on an unchecked column when the report no longer aggregates after the pruning', () => {
    const only = config({
      aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
      dateTruncConfig: [],
    });
    const { config: next, changed } = pruneRulesForDeselectedColumns(only, new Set(['revenue']), {
      selectedNames: new Set(['country']),
      knownNames: KNOWN,
      calculatedFields: NO_CALCULATED,
    });

    expect(next.aggregationConfig).toEqual([]);
    expect(next.sortConfig).toEqual(only.sortConfig);
    expect(changed).toEqual(['aggregationConfig']);
  });

  it('keeps the sort on an unchecked column of a plain report', () => {
    const plain = config({ aggregationConfig: [], dateTruncConfig: [] });
    const result = pruneRulesForDeselectedColumns(plain, new Set(['revenue']), {
      selectedNames: new Set(['country']),
      knownNames: KNOWN,
      calculatedFields: NO_CALCULATED,
    });

    expect(result.config).toBe(plain);
    expect(result.changed).toEqual([]);
  });

  // A disconnected row being unchecked: the column is gone from the schema, so a sort on it can
  // never resolve, whatever the report's shape — leaving it would fail the very next save.
  it('always removes the sort on an unchecked column that the schema no longer offers', () => {
    const plain = config({
      aggregationConfig: [],
      dateTruncConfig: [],
      sortConfig: [
        { column: 'ghost', direction: 'asc' },
        { column: 'country', direction: 'asc' },
      ],
    });
    const { config: next, changed } = pruneRulesForDeselectedColumns(plain, new Set(['ghost']), {
      selectedNames: new Set(['country']),
      knownNames: KNOWN,
      calculatedFields: NO_CALCULATED,
    });

    expect(next.sortConfig).toEqual([{ column: 'country', direction: 'asc' }]);
    expect(changed).toEqual(['sortConfig']);
  });

  it('always removes the sort on an unchecked calculated field', () => {
    const plain = config({
      aggregationConfig: [],
      dateTruncConfig: [],
      sortConfig: [{ column: 'clicks_x2', direction: 'asc' }],
    });
    const { config: next, changed } = pruneRulesForDeselectedColumns(
      plain,
      new Set(['clicks_x2']),
      {
        selectedNames: new Set(['country']),
        knownNames: KNOWN,
        calculatedFields: { all: new Set(['clicks_x2']), aggregate: new Set() },
      }
    );

    expect(next.sortConfig).toEqual([]);
    expect(changed).toEqual(['sortConfig']);
  });

  it('removes the sort on an unchecked column while a selected aggregate-level calculated field still groups the report', () => {
    const plain = config({ aggregationConfig: [], dateTruncConfig: [] });
    const { config: next } = pruneRulesForDeselectedColumns(plain, new Set(['revenue']), {
      selectedNames: new Set(['ctr']),
      knownNames: KNOWN,
      calculatedFields: { all: new Set(['ctr']), aggregate: new Set(['ctr']) },
    });

    expect(next.sortConfig).toEqual([{ column: 'country', direction: 'asc' }]);
  });

  it('returns the same config when nothing was unchecked', () => {
    const same = config();
    expect(
      pruneRulesForDeselectedColumns(same, new Set(), {
        selectedNames: new Set(['revenue']),
        knownNames: KNOWN,
        calculatedFields: NO_CALCULATED,
      })
    ).toEqual({ config: same, changed: [] });
  });
});
