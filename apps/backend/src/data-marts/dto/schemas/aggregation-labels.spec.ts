import {
  ROW_COUNT_LABEL,
  aggregatedColumnAlias,
  aggregatedColumnLabel,
  aggregateFunctionLabel,
} from './aggregation-labels';

describe('aggregation-labels', () => {
  it('aggregatedColumnLabel appends the friendly function suffix', () => {
    expect(aggregatedColumnLabel('sessions', 'SUM')).toBe('sessions | SUM');
    expect(aggregatedColumnLabel('revenue', 'AVG')).toBe('revenue | AVG');
  });

  it('aggregatedColumnLabel uses readable labels for the cryptic functions', () => {
    expect(aggregatedColumnLabel('users', 'COUNT_DISTINCT')).toBe('users | COUNTUNIQUE');
    expect(aggregatedColumnLabel('tags', 'STRING_AGG')).toBe('tags | STRINGAGG');
    expect(aggregatedColumnLabel('price', 'P95')).toBe('price | P95');
    expect(aggregatedColumnLabel('price', 'P50')).toBe('price | MEDIAN');
  });

  // BigQuery rejects a dot in an output alias entirely (verified on real BQ), so a nested /
  // struct column path is sanitized in the OUTPUT name — dots become `_`. The alias and the
  // header both come from here, so they stay in sync.
  it('aggregatedColumnLabel sanitizes dots in a nested/struct column path', () => {
    expect(aggregatedColumnLabel('metrics.revenue', 'SUM')).toBe('metrics_revenue | SUM');
    expect(aggregatedColumnLabel('a.b.c', 'COUNT_DISTINCT')).toBe('a_b_c | COUNTUNIQUE');
  });

  it('aggregatedColumnAlias appends the same function suffix to a display alias', () => {
    expect(aggregatedColumnAlias('Revenue', 'SUM')).toBe('Revenue | SUM');
    expect(aggregatedColumnAlias('Revenue', 'AVG')).toBe('Revenue | AVG');
  });

  // Unlike the SQL-facing label, the alias is display-only: dots are legal and must survive.
  it('aggregatedColumnAlias does NOT sanitize dots in the display alias', () => {
    expect(aggregatedColumnAlias('Revenue v2.0', 'SUM')).toBe('Revenue v2.0 | SUM');
  });

  it('aggregateFunctionLabel maps every function to a human-readable Title Case label', () => {
    expect(aggregateFunctionLabel('SUM')).toBe('Sum');
    expect(aggregateFunctionLabel('ANY_VALUE')).toBe('Sample');
    expect(aggregateFunctionLabel('P25')).toBe('25th Percentile');
  });

  it('ROW_COUNT_LABEL is "Row Count"', () => {
    expect(ROW_COUNT_LABEL).toBe('Row Count');
  });
});
