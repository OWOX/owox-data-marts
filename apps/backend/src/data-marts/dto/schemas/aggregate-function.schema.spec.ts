import {
  REPORT_AGGREGATE_FUNCTIONS,
  SLEEVE_ROUTED_FUNCTIONS,
  VALUE_SLEEVE_FUNCTIONS,
  isPercentileFunction,
  sleeveShapeFor,
  type ReportAggregateFunction,
} from './aggregate-function.schema';

describe('SLEEVE_ROUTING', () => {
  it('routes exactly the functions that must read a joined column at the raw grain', () => {
    expect([...SLEEVE_ROUTED_FUNCTIONS].sort()).toEqual(
      [
        'AVG',
        'COUNT_DISTINCT',
        'MAX',
        'MIN',
        'P25',
        'P50',
        'P75',
        'P95',
        'STRING_AGG',
        'SUM',
      ].sort()
    );
  });

  it('gives COUNT_DISTINCT its own shape and every other routed function the value shape', () => {
    expect(sleeveShapeFor('COUNT_DISTINCT')).toBe('count-distinct');
    for (const fn of [
      'SUM',
      'AVG',
      'P25',
      'P50',
      'P75',
      'P95',
      'STRING_AGG',
      'MIN',
      'MAX',
    ] as ReportAggregateFunction[]) {
      expect(sleeveShapeFor(fn)).toBe('value');
    }
  });

  // MIN/MAX are routed for a different reason than SUM/AVG: repetition does not change them,
  // but reading the pre-join roll-up while SUM/AVG read raw rows measures one column at two
  // grains, and `MIN <= AVG <= MAX` stops holding.
  it('leaves every unrouted function without a shape', () => {
    for (const fn of ['COUNT', 'ANY_VALUE'] as ReportAggregateFunction[]) {
      expect(sleeveShapeFor(fn)).toBeNull();
      expect(SLEEVE_ROUTED_FUNCTIONS.has(fn)).toBe(false);
    }
  });

  it('keeps the derived sets consistent with the table', () => {
    for (const fn of REPORT_AGGREGATE_FUNCTIONS) {
      const shape = sleeveShapeFor(fn);
      expect(SLEEVE_ROUTED_FUNCTIONS.has(fn)).toBe(shape !== null);
      expect(VALUE_SLEEVE_FUNCTIONS.has(fn)).toBe(shape === 'value');
    }
  });

  it('covers every report function — no function can be silently unclassified', () => {
    for (const fn of REPORT_AGGREGATE_FUNCTIONS) {
      expect([null, 'count-distinct', 'value']).toContain(sleeveShapeFor(fn));
    }
  });
});

describe('isPercentileFunction', () => {
  it('narrows exactly the percentiles, which the clause renderer spells per warehouse', () => {
    for (const fn of REPORT_AGGREGATE_FUNCTIONS) {
      expect(isPercentileFunction(fn)).toBe(['P25', 'P50', 'P75', 'P95'].includes(fn));
    }
  });
});
