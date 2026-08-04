import { preJoinAggregateFunctionFor, reAggregateFunctionFor } from './re-aggregation';

describe('preJoinAggregateFunctionFor', () => {
  it.each([
    ['STRING', 'MAX'],
    ['INTEGER', 'MAX'],
    ['DATE', 'MAX'],
    ['TIMESTAMP', 'MAX'],
  ])('replaces ANY_VALUE with MAX on an orderable %s', (type, expected) => {
    expect(preJoinAggregateFunctionFor('ANY_VALUE', type)).toBe(expected);
  });

  it.each(['BOOLEAN', 'JSON', 'ARRAY<INT64>', 'STRUCT<a INT64>', 'GEOGRAPHY'])(
    'keeps ANY_VALUE on %s, where MAX is not defined everywhere',
    type => {
      expect(preJoinAggregateFunctionFor('ANY_VALUE', type)).toBe('ANY_VALUE');
    }
  );

  it('keeps ANY_VALUE when the type is unknown', () => {
    expect(preJoinAggregateFunctionFor('ANY_VALUE', undefined)).toBe('ANY_VALUE');
  });

  it.each(['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'COUNT_DISTINCT', 'STRING_AGG'] as const)(
    'leaves %s alone — only ANY_VALUE is non-deterministic',
    fn => {
      expect(preJoinAggregateFunctionFor(fn, 'STRING')).toBe(fn);
    }
  );
});

describe('reAggregateFunctionFor', () => {
  it('maps ANY_VALUE to MAX for the same determinism reason', () => {
    expect(reAggregateFunctionFor('ANY_VALUE')).toBe('MAX');
  });
});
