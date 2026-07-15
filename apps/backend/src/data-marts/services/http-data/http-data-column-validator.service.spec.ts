import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { ReportingColumns } from './http-data-column-sets.util';
import { HttpDataColumnValidator } from './http-data-column-validator.service';

describe('HttpDataColumnValidator', () => {
  const validator = new HttpDataColumnValidator();
  const columns: ReportingColumns = { native: ['date', 'revenue'], blended: ['orders__cost'] };

  it('accepts native and reporting-visible blended columns', () => {
    expect(() =>
      validator.validate({ selectedColumns: ['date', 'orders__cost'] }, columns)
    ).not.toThrow();
  });

  it('rejects unknown selected columns with a business violation', () => {
    expect(() => validator.validate({ selectedColumns: ['date', 'ghost'] }, columns)).toThrow(
      BusinessViolationException
    );
  });

  it('rejects columns outside the reporting-visible set (hidden or excluded-source)', () => {
    expect(() => validator.validate({ selectedColumns: ['orders__secret'] }, columns)).toThrow(
      BusinessViolationException
    );
  });

  it('validates post-join filter and sort columns for existence', () => {
    expect(() =>
      validator.validate(
        { selectedColumns: ['date'], sort: [{ column: 'ghost', direction: 'asc' }] },
        columns
      )
    ).toThrow(BusinessViolationException);

    expect(() =>
      validator.validate(
        {
          selectedColumns: ['date'],
          filter: [{ column: 'ghost', operator: 'gt', value: 1 }] as never,
        },
        columns
      )
    ).toThrow(BusinessViolationException);
  });

  it('validates aggregation columns for existence', () => {
    expect(() =>
      validator.validate(
        {
          selectedColumns: ['date', 'revenue'],
          aggregation: [{ column: 'revenue', function: 'SUM' }],
        },
        columns
      )
    ).not.toThrow();

    expect(() =>
      validator.validate(
        { selectedColumns: ['date'], aggregation: [{ column: 'ghost', function: 'SUM' }] },
        columns
      )
    ).toThrow(BusinessViolationException);
  });

  it('validates date-trunc columns for existence', () => {
    expect(() =>
      validator.validate(
        { selectedColumns: ['date'], dateTrunc: [{ column: 'date', unit: 'MONTH' }] },
        columns
      )
    ).not.toThrow();

    expect(() =>
      validator.validate(
        { selectedColumns: ['date'], dateTrunc: [{ column: 'ghost', unit: 'MONTH' }] },
        columns
      )
    ).toThrow(BusinessViolationException);
  });

  it('ignores pre-join filter columns (resolved by aliasPath downstream, not by name here)', () => {
    expect(() =>
      validator.validate(
        {
          selectedColumns: ['date'],
          filter: [
            {
              column: 'employee_age',
              operator: 'gt',
              value: 18,
              placement: 'pre-join',
              aliasPath: 'employees',
            },
          ] as never,
        },
        columns
      )
    ).not.toThrow();
  });
});
