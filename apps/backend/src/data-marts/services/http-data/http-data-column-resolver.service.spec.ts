import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { ColumnSelector } from '../../dto/schemas/http-data-query.schema';
import { ReportingColumns } from './http-data-column-sets.util';
import { HttpDataColumnResolver } from './http-data-column-resolver.service';

describe('HttpDataColumnResolver', () => {
  const resolver = new HttpDataColumnResolver();
  const columns: ReportingColumns = {
    native: ['date', 'revenue'],
    implicitAllNative: ['date', 'revenue'],
    blended: ['orders__cost'],
    implicitAllBlended: ['orders__cost'],
  };

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
    const selector: ColumnSelector = { mode: 'explicit', explicit: ['revenue', '*', '**'] };
    expect(resolver.resolve(selector, columns)).toEqual(['revenue', '*', '**']);
  });

  it('throws a business violation when the selection resolves to no columns', () => {
    expect(() =>
      resolver.resolve(
        { mode: 'allNative', explicit: [] },
        { native: [], implicitAllNative: [], blended: [], implicitAllBlended: [] }
      )
    ).toThrow(BusinessViolationException);
  });

  describe('a calculated field — named selection only', () => {
    // `native` still carries it (existence-checking authority for HttpDataColumnValidator);
    // `implicitAllNative` does not (what a wildcard actually resolves to).
    const withCalculatedField: ReportingColumns = {
      native: ['date', 'revenue', 'ctr'],
      implicitAllNative: ['date', 'revenue'],
      blended: [],
      implicitAllBlended: [],
    };

    it('is absent from "*"', () => {
      expect(resolver.resolve({ mode: 'allNative', explicit: [] }, withCalculatedField)).toEqual([
        'date',
        'revenue',
      ]);
    });

    it('is absent from "**"', () => {
      expect(resolver.resolve({ mode: 'allBlendable' }, withCalculatedField)).toEqual([
        'date',
        'revenue',
      ]);
    });

    it('is present when named explicitly, even combined with "*"', () => {
      const selector: ColumnSelector = { mode: 'allNative', explicit: ['ctr'] };
      expect(resolver.resolve(selector, withCalculatedField)).toEqual(['date', 'revenue', 'ctr']);
    });

    it('is present under plain explicit selection', () => {
      const selector: ColumnSelector = { mode: 'explicit', explicit: ['ctr'] };
      expect(resolver.resolve(selector, withCalculatedField)).toEqual(['ctr']);
    });
  });

  // Decision 10 holds across the join too. A joined Data Mart's calculated field cannot be
  // projected at all (the blended path refuses it by name), so sweeping it into "**" turns an
  // unchanged NDJSON integration into a 400 the day someone adds a formula to a DIFFERENT Data
  // Mart — the exact promise the feature makes about wildcard requests.
  describe('a joined Data Mart calculated field — named selection across the join', () => {
    const withJoinedCalculated: ReportingColumns = {
      native: ['date'],
      implicitAllNative: ['date'],
      blended: ['orders__cost', 'orders__margin'],
      implicitAllBlended: ['orders__cost'],
    };

    it('is absent from "**"', () => {
      expect(resolver.resolve({ mode: 'allBlendable' }, withJoinedCalculated)).toEqual([
        'date',
        'orders__cost',
      ]);
    });

    it('still reaches the request when named explicitly, so the refusal can name it', () => {
      const selector: ColumnSelector = { mode: 'explicit', explicit: ['orders__margin'] };
      expect(resolver.resolve(selector, withJoinedCalculated)).toEqual(['orders__margin']);
    });
  });
});
