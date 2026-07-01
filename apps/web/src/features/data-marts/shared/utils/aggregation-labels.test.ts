import { describe, it, expect } from 'vitest';
import { REPORT_AGGREGATE_FUNCTION_LABELS, aggregateFunctionLabel } from './aggregation-labels';
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

  it('has exactly one non-empty label for every aggregate function (no missing/extra key)', () => {
    expect(Object.keys(REPORT_AGGREGATE_FUNCTION_LABELS).sort()).toEqual(
      [...REPORT_AGGREGATE_FUNCTIONS].sort()
    );
    for (const fn of REPORT_AGGREGATE_FUNCTIONS) {
      expect(aggregateFunctionLabel(fn).length).toBeGreaterThan(0);
    }
  });
});
