import { BadRequestException } from '@nestjs/common';
import { mapReportFilters } from './report-filter-input';

describe('mapReportFilters', () => {
  it('passes undefined through (caller keeps or omits filters)', () => {
    expect(mapReportFilters(undefined)).toBeUndefined();
  });

  it('maps an empty array to null (no filters)', () => {
    expect(mapReportFilters([])).toBeNull();
  });

  it('maps every rule as a post-join filter in the domain vocabulary', () => {
    expect(
      mapReportFilters([
        { field: 'purchases', operator: 'eq', value: 0 },
        { field: 'created_at', operator: 'in_last_n_days', value: 30 },
      ])
    ).toEqual([
      { column: 'purchases', operator: 'eq', value: 0, placement: 'post-join' },
      {
        column: 'created_at',
        operator: 'relative_date',
        value: { kind: 'last_n_days', n: 30 },
        placement: 'post-join',
      },
    ]);
  });

  it('turns an unsupported operator into a BadRequestException naming the vocabulary', () => {
    expect(() => mapReportFilters([{ field: 'channel', operator: 'in', value: ['ads'] }])).toThrow(
      BadRequestException
    );
    expect(() => mapReportFilters([{ field: 'channel', operator: 'in', value: ['ads'] }])).toThrow(
      /Supported operators/
    );
  });

  it('turns a malformed operand into a BadRequestException', () => {
    expect(() => mapReportFilters([{ field: 'revenue', operator: 'between', value: 5 }])).toThrow(
      BadRequestException
    );
    expect(() =>
      mapReportFilters([{ field: 'created_at', operator: 'in_last_n_days', value: 'soon' }])
    ).toThrow(BadRequestException);
  });
});
