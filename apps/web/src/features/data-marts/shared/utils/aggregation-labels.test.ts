import { describe, it, expect } from 'vitest';
import {
  REPORT_AGGREGATE_FUNCTION_LABELS,
  UNIQUE_COUNT_LABEL,
  aggregateFunctionLabel,
  buildJoinedUniqueCountColumnName,
} from './aggregation-labels';
import { REPORT_AGGREGATE_FUNCTIONS } from '../types/relationship.types';

// Drift guard. This web map MUST stay byte-for-byte identical to the backend
// `REPORT_AGGREGATE_FUNCTION_LABELS` (apps/backend/src/data-marts/dto/schemas/aggregation-labels.ts),
// because the backend uses these exact labels to build the aggregated output-column SQL alias
// (`<column> aggregated by <label>`) while the web only displays them. If the two drift, the
// picker shows a name that differs from the produced column. The backend map is pinned by its
// alias↔header round-trip tests; this test pins the web side to the same canonical values so a
// silent edit here fails CI. When intentionally changing a label, update BOTH maps + this literal.
describe('REPORT_AGGREGATE_FUNCTION_LABELS (web mirror — drift guard)', () => {
  it('matches the canonical Title-Case labels exactly', () => {
    expect(REPORT_AGGREGATE_FUNCTION_LABELS).toEqual({
      SUM: 'Sum',
      AVG: 'Average',
      MIN: 'Min',
      MAX: 'Max',
      COUNT: 'Count',
      COUNT_DISTINCT: 'Count Unique',
      STRING_AGG: 'Combined',
      ANY_VALUE: 'Sample',
      P25: '25th Percentile',
      P50: 'Median',
      P75: '75th Percentile',
      P95: '95th Percentile',
    });
  });

  // Same drift contract as the map above: the backend emits this as the literal SQL alias
  // and header name, and the web builds sort rules from it, so a silent edit must fail CI.
  it('pins the synthetic output-column label', () => {
    expect(UNIQUE_COUNT_LABEL).toBe('Unique Count');
  });

  // Mirror of the backend `buildJoinedUniqueCountColumnName`. This is the SQL alias, the header
  // `name`, and the value a sort rule stores — it must come from the alias path, never from the
  // free-form display prefix, which may contain dots and spaces no dialect accepts unquoted.
  it('builds a joined source’s SQL column name from its alias path', () => {
    expect(buildJoinedUniqueCountColumnName('orders')).toBe('orders__unique_count');
    expect(buildJoinedUniqueCountColumnName('orders.items')).toBe('orders_items__unique_count');
  });

  // The joined source's DISPLAY label is not built here at all — the picker shows a bare
  // `Unique Count` and the exported header is formatted on the backend. A free-form prefix must
  // never reach the SQL name.
  it('keeps the SQL name free of the free-form display prefix', () => {
    expect(buildJoinedUniqueCountColumnName('ga4_events')).toBe('ga4_events__unique_count');
  });

  it('has exactly one non-empty label for every aggregate function (no missing/extra key)', () => {
    expect(Object.keys(REPORT_AGGREGATE_FUNCTION_LABELS).sort()).toEqual(
      [...REPORT_AGGREGATE_FUNCTIONS].sort()
    );
    for (const fn of REPORT_AGGREGATE_FUNCTIONS) {
      expect(aggregateFunctionLabel(fn).length).toBeGreaterThan(0);
    }
  });
});
