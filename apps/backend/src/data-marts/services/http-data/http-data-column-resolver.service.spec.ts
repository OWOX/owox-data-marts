import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { ColumnSelector } from '../../dto/schemas/http-data-query.schema';
import { ReportingColumns } from './http-data-column-sets.util';
import { HttpDataColumnResolver } from './http-data-column-resolver.service';

describe('HttpDataColumnResolver', () => {
  const resolver = new HttpDataColumnResolver();
  const columns: ReportingColumns = { native: ['date', 'revenue'], blended: ['orders__cost'] };

  it('expands "*" to all native columns', () => {
    const selector: ColumnSelector = { mode: 'allNative', explicit: [] };
    expect(resolver.resolve(selector, columns)).toEqual(['date', 'revenue']);
  });

  it('appends explicit columns to "*" and de-duplicates overlaps', () => {
    const selector: ColumnSelector = { mode: 'allNative', explicit: ['orders__cost', 'date'] };
    expect(resolver.resolve(selector, columns)).toEqual(['date', 'revenue', 'orders__cost']);
  });

  it('expands "**" to native plus reporting-visible blended columns', () => {
    expect(resolver.resolve({ mode: 'allBlendable' }, columns)).toEqual([
      'date',
      'revenue',
      'orders__cost',
    ]);
  });

  it('returns explicit columns verbatim', () => {
    const selector: ColumnSelector = { mode: 'explicit', explicit: ['revenue', 'orders__cost'] };
    expect(resolver.resolve(selector, columns)).toEqual(['revenue', 'orders__cost']);
  });

  it('throws a business violation when the selection resolves to no columns', () => {
    expect(() =>
      resolver.resolve({ mode: 'allNative', explicit: [] }, { native: [], blended: [] })
    ).toThrow(BusinessViolationException);
  });
});
