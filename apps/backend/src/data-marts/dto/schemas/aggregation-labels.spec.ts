import {
  ROW_COUNT_LABEL,
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

  it('aggregateFunctionLabel maps every function to a human-readable Title Case label', () => {
    expect(aggregateFunctionLabel('SUM')).toBe('Sum');
    expect(aggregateFunctionLabel('ANY_VALUE')).toBe('Sample');
    expect(aggregateFunctionLabel('P25')).toBe('25th Percentile');
  });

  it('ROW_COUNT_LABEL is "Row Count"', () => {
    expect(ROW_COUNT_LABEL).toBe('Row Count');
  });
});
