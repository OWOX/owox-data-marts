import { hasOutputControls, shouldIncludeRowCount } from './report-like-read-plan';
import { DataMart } from '../../entities/data-mart.entity';

const basePlan = {
  dataMart: {} as DataMart,
};

describe('hasOutputControls', () => {
  it('returns false when no output controls are set', () => {
    expect(hasOutputControls({ ...basePlan })).toBe(false);
  });

  it('returns true when filterConfig is non-empty', () => {
    expect(
      hasOutputControls({
        ...basePlan,
        filterConfig: [{ column: 'c', operator: 'eq', value: 1 }],
      })
    ).toBe(true);
  });

  it('returns true when sortConfig is non-empty', () => {
    expect(
      hasOutputControls({ ...basePlan, sortConfig: [{ column: 'c', direction: 'asc' }] })
    ).toBe(true);
  });

  it('returns true when aggregationConfig is non-empty', () => {
    expect(
      hasOutputControls({ ...basePlan, aggregationConfig: [{ column: 'c', function: 'SUM' }] })
    ).toBe(true);
  });

  it('returns true when dateTruncConfig is non-empty', () => {
    expect(
      hasOutputControls({ ...basePlan, dateTruncConfig: [{ column: 'date', unit: 'MONTH' }] })
    ).toBe(true);
  });

  it('returns true when limitConfig is set', () => {
    expect(hasOutputControls({ ...basePlan, limitConfig: 100 })).toBe(true);
  });

  it('returns true when uniqueCountConfig === true', () => {
    expect(hasOutputControls({ ...basePlan, uniqueCountConfig: true })).toBe(true);
  });

  it('returns false when uniqueCountConfig === null', () => {
    expect(hasOutputControls({ ...basePlan, uniqueCountConfig: null })).toBe(false);
  });

  it('returns false when uniqueCountConfig === false', () => {
    expect(hasOutputControls({ ...basePlan, uniqueCountConfig: false })).toBe(false);
  });
});

describe('shouldIncludeRowCount', () => {
  it('defaults to true for an aggregated plan (no explicit override)', () => {
    expect(
      shouldIncludeRowCount({ ...basePlan, aggregationConfig: [{ column: 'c', function: 'SUM' }] })
    ).toBe(true);
  });

  it('defaults to false when there are no aggregations', () => {
    expect(shouldIncludeRowCount({ ...basePlan })).toBe(false);
    expect(shouldIncludeRowCount({ ...basePlan, aggregationConfig: [] })).toBe(false);
  });

  it('honors an explicit rowCount: false even when aggregations are present (the Totals plan)', () => {
    expect(
      shouldIncludeRowCount({
        ...basePlan,
        rowCount: false,
        aggregationConfig: [{ column: 'c', function: 'SUM' }],
      })
    ).toBe(false);
  });

  it('honors an explicit rowCount: true even with no aggregations', () => {
    expect(shouldIncludeRowCount({ ...basePlan, rowCount: true })).toBe(true);
  });

  // A lone date bucket is a grouping key, not an aggregation: the DWH still GROUPs BY the
  // truncated column, but no automatic Row Count column is projected. This is the intended
  // divergence from the UI's "Row Count" hint — Row Count is opt-in via aggregations only.
  it('returns false for a date-trunc-only plan (bucket set, no aggregations)', () => {
    expect(
      shouldIncludeRowCount({ ...basePlan, dateTruncConfig: [{ column: 'date', unit: 'MONTH' }] })
    ).toBe(false);
    expect(
      shouldIncludeRowCount({
        ...basePlan,
        dateTruncConfig: [{ column: 'date', unit: 'MONTH', timeZone: 'America/New_York' }],
        aggregationConfig: [],
      })
    ).toBe(false);
  });
});
