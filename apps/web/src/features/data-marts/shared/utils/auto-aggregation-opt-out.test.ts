import { describe, expect, it } from 'vitest';
import {
  withAutoAggregationOptOut,
  withoutAutoAggregationOptOutFor,
} from './auto-aggregation-opt-out';
import { EMPTY_OUTPUT_CONFIG, type OutputConfig } from '../types/output-config';

const withRules = (columns: string[], optOut?: string[]): OutputConfig => ({
  ...EMPTY_OUTPUT_CONFIG,
  aggregationConfig: columns.map(column => ({ column, function: 'SUM' })),
  autoAggregationOptOut: optOut,
});

describe('withAutoAggregationOptOut', () => {
  it('opts out every column whose aggregation was removed', () => {
    const next = withAutoAggregationOptOut(
      withRules(['sessions', 'review_id', 'rating']),
      withRules(['rating'])
    );
    expect(next.autoAggregationOptOut).toEqual(['sessions', 'review_id']);
  });

  it('withdraws the opt-out once the column is aggregated again', () => {
    const next = withAutoAggregationOptOut(
      withRules([], ['sessions', 'review_id']),
      withRules(['sessions'], ['sessions', 'review_id'])
    );
    expect(next.autoAggregationOptOut).toEqual(['review_id']);
  });

  it('keeps the opt-out through an edit that touches no aggregation', () => {
    const previous = withRules([], ['sessions']);
    const next = { ...previous, limitConfig: 100 };
    expect(withAutoAggregationOptOut(previous, next)).toBe(next);
  });

  it('treats a changed function on the same column as no removal', () => {
    const next = withAutoAggregationOptOut(withRules(['sessions']), {
      ...withRules([]),
      aggregationConfig: [{ column: 'sessions', function: 'AVG' }],
    });
    expect(next.autoAggregationOptOut ?? []).toEqual([]);
  });
});

describe('withoutAutoAggregationOptOutFor', () => {
  it('drops the opt-out of a deselected column only', () => {
    const next = withoutAutoAggregationOptOutFor(
      withRules([], ['sessions', 'rating']),
      new Set(['sessions'])
    );
    expect(next.autoAggregationOptOut).toEqual(['rating']);
  });
});
