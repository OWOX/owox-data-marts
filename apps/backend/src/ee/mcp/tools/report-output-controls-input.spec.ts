import { BadRequestException } from '@nestjs/common';
import {
  mapReportAggregations,
  mapReportDateBuckets,
  mapReportFilters,
  mapReportSort,
} from './report-output-controls-input';

describe('mapReportFilters', () => {
  it('passes undefined through when neither slices nor filters were provided', () => {
    expect(mapReportFilters(undefined, undefined)).toBeUndefined();
  });

  it('maps empty arrays to null (no filters)', () => {
    expect(mapReportFilters([], [])).toBeNull();
    expect(mapReportFilters(undefined, [])).toBeNull();
    expect(mapReportFilters([], undefined)).toBeNull();
  });

  it('maps filters as post-join and slices as pre-join rules in the domain vocabulary', () => {
    expect(
      mapReportFilters(
        [{ field: 'source', operator: 'eq', value: 'ga4' }],
        [
          { field: 'purchases', operator: 'eq', value: 0 },
          { field: 'created_at', operator: 'in_last_n_days', value: 30 },
        ]
      )
    ).toEqual([
      { column: 'source', operator: 'eq', value: 'ga4', placement: 'pre-join' },
      { column: 'purchases', operator: 'eq', value: 0, placement: 'post-join' },
      {
        column: 'created_at',
        operator: 'relative_date',
        value: { kind: 'last_n_days', n: 30 },
        placement: 'post-join',
      },
    ]);
  });

  it('maps an in filter natively (no longer an unsupported operator)', () => {
    expect(
      mapReportFilters(undefined, [{ field: 'channel', operator: 'in', value: ['ads'] }])
    ).toEqual([{ column: 'channel', operator: 'in', value: ['ads'], placement: 'post-join' }]);
  });

  it('turns an unsupported operator into a BadRequestException naming the vocabulary', () => {
    // Every enum operator maps today; the defensive path fires only for a raw
    // operator string a direct caller invents.
    expect(() =>
      mapReportFilters(undefined, [{ field: 'channel', operator: 'not_a_real_op', value: 'x' }])
    ).toThrow(BadRequestException);
    expect(() =>
      mapReportFilters(undefined, [{ field: 'channel', operator: 'not_a_real_op', value: 'x' }])
    ).toThrow(/Supported operators/);
    // Regression: the message must not steer the client into emulating an OR
    // match with repeated eq filters — filters combine with AND.
    expect(() =>
      mapReportFilters(undefined, [{ field: 'channel', operator: 'not_a_real_op', value: 'x' }])
    ).not.toThrow(/use multiple filters/);
  });

  it('turns a malformed operand into a BadRequestException', () => {
    expect(() =>
      mapReportFilters(undefined, [{ field: 'revenue', operator: 'between', value: 5 }])
    ).toThrow(BadRequestException);
    expect(() =>
      mapReportFilters(undefined, [
        { field: 'created_at', operator: 'in_last_n_days', value: 'soon' },
      ])
    ).toThrow(BadRequestException);
  });
});

describe('mapReportAggregations', () => {
  it('keeps the undefined / empty→null / mapped convention', () => {
    expect(mapReportAggregations(undefined)).toBeUndefined();
    expect(mapReportAggregations([])).toBeNull();
    expect(mapReportAggregations([{ field: 'revenue', function: 'SUM' }])).toEqual([
      { column: 'revenue', function: 'SUM' },
    ]);
  });

  it('turns an unsupported function into a BadRequestException', () => {
    expect(() => mapReportAggregations([{ field: 'revenue', function: 'MEDIAN' }])).toThrow(
      BadRequestException
    );
  });
});

describe('mapReportDateBuckets', () => {
  it('keeps the undefined / empty→null / mapped convention', () => {
    expect(mapReportDateBuckets(undefined)).toBeUndefined();
    expect(mapReportDateBuckets([])).toBeNull();
    expect(
      mapReportDateBuckets([{ field: 'date', unit: 'MONTH', time_zone: 'Europe/Kyiv' }])
    ).toEqual([{ column: 'date', unit: 'MONTH', timeZone: 'Europe/Kyiv' }]);
  });

  it('turns an unsupported unit into a BadRequestException', () => {
    expect(() => mapReportDateBuckets([{ field: 'date', unit: 'FORTNIGHT' }])).toThrow(
      BadRequestException
    );
  });
});

describe('mapReportSort', () => {
  it('keeps the undefined / empty→null / mapped convention', () => {
    expect(mapReportSort(undefined)).toBeUndefined();
    expect(mapReportSort([])).toBeNull();
    expect(mapReportSort([{ field: 'revenue', direction: 'desc' }])).toEqual([
      { column: 'revenue', direction: 'desc' },
    ]);
  });
});
