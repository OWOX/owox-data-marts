import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { ReportingColumns } from './http-data-column-sets.util';
import { HttpDataColumnValidator } from './http-data-column-validator.service';

describe('HttpDataColumnValidator', () => {
  const validator = new HttpDataColumnValidator();
  const columns: ReportingColumns = {
    native: ['date', 'revenue'],
    implicitAllNative: ['date', 'revenue'],
    blended: ['orders__cost'],
    implicitAllBlended: ['orders__cost'],
    reportableSources: [],
  };

  // The existence check binds against `blended`, never `implicitAllBlended`: a joined calculated
  // field is a real, visible field of the join tree, so naming it must reach the downstream
  // refusal that says WHY it cannot be projected — not come back as "Unknown column", which sends
  // the caller to repair a schema link that is not broken.
  it('treats a joined calculated field as known, even though a wildcard never expands to it', () => {
    const withJoinedCalculated: ReportingColumns = {
      native: ['date'],
      implicitAllNative: ['date'],
      blended: ['orders__cost', 'orders__margin'],
      implicitAllBlended: ['orders__cost'],
      reportableSources: [],
    };

    expect(() =>
      validator.validate({ selectedColumns: ['orders__margin'] }, withJoinedCalculated)
    ).not.toThrow();
  });

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

  it('lets a sort name a requested Unique Count column, and only a requested one', () => {
    const sortBy = (column: string) => ({
      selectedColumns: ['date'],
      sort: [{ column, direction: 'desc' as const }],
      uniqueCount: ['', 'orders.items'],
    });

    const withItems: ReportingColumns = { ...columns, reportableSources: ['orders.items'] };

    expect(() => validator.validate(sortBy('Unique Count'), withItems)).not.toThrow();
    expect(() => validator.validate(sortBy('orders_items__unique_count'), withItems)).not.toThrow();
    expect(() => validator.validate(sortBy('orders__unique_count'), withItems)).toThrow(
      BusinessViolationException
    );
    expect(() =>
      validator.validate({ ...sortBy('Unique Count'), uniqueCount: undefined }, withItems)
    ).toThrow(BusinessViolationException);
  });

  // Whether a filter, aggregation, bucket or field selection may name it is the shared
  // validator's call, with its own UNIQUE_COUNT_* code; here it only must not read as unknown.
  it('leaves every other clause naming a requested Unique Count to the shared validator', () => {
    expect(() =>
      validator.validate(
        {
          selectedColumns: ['date', 'Unique Count'],
          filter: [{ column: 'Unique Count', operator: 'gt', value: 1 }] as never,
          aggregation: [{ column: 'Unique Count', function: 'SUM' }] as never,
          dateTrunc: [{ column: 'Unique Count', unit: 'MONTH' }] as never,
          uniqueCount: [''],
        },
        columns
      )
    ).not.toThrow();
  });

  // An excluded or inaccessible source is dropped from the SQL downstream, so counting it would
  // return rows without the count; the endpoint already treats its fields as unknown.
  it('rejects a joined Unique Count source outside the reportable sources', () => {
    const withOrders: ReportingColumns = { ...columns, reportableSources: ['orders'] };
    const read = (uniqueCount: string[]) => ({ selectedColumns: ['date'], uniqueCount });

    expect(() => validator.validate(read(['', 'orders']), withOrders)).not.toThrow();
    expect(() => validator.validate(read(['orders', 'refunds']), withOrders)).toThrow(
      'Unique Count source not available for reporting: refunds'
    );
    expect(() => validator.validate(read(['']), columns)).not.toThrow();
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
