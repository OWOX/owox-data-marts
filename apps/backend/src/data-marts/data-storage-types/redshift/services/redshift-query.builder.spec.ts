import { NotImplementedException } from '@nestjs/common';
import { RedshiftQueryBuilder } from './redshift-query.builder';

describe('RedshiftQueryBuilder — output controls guard', () => {
  const builder = new RedshiftQueryBuilder();
  const tableDef = { type: 'table', fullyQualifiedName: 'myschema.tbl' } as any;

  it('throws NotImplemented when filters are non-empty', () => {
    expect(() =>
      builder.buildQuery(tableDef, {
        filters: [{ column: 'a', operator: 'eq', value: 1 }],
      })
    ).toThrow(NotImplementedException);
  });

  it('throws NotImplemented when sort is non-empty', () => {
    expect(() =>
      builder.buildQuery(tableDef, {
        sort: [{ column: 'a', direction: 'asc' }],
      })
    ).toThrow(NotImplementedException);
  });

  it('still works without output controls (limit-only legacy path)', () => {
    expect(builder.buildQuery(tableDef, { limit: 0 })).toBeDefined();
  });

  it('still works without options', () => {
    expect(builder.buildQuery(tableDef)).toBeDefined();
  });
});
