import { NotImplementedException } from '@nestjs/common';
import { DatabricksQueryBuilder } from './databricks-query.builder';

describe('DatabricksQueryBuilder', () => {
  const builder = new DatabricksQueryBuilder();

  it('wraps SQL definitions with limit and strips trailing semicolon', () => {
    const query = builder.buildQuery(
      {
        type: 'SQL',
        sqlQuery: 'SELECT 1;',
      } as never,
      { limit: 0 }
    );

    expect(query).toBe('SELECT * FROM (SELECT 1) LIMIT 0');
  });

  it('wraps SQL definitions with limit without changing valid queries', () => {
    const query = builder.buildQuery(
      {
        type: 'SQL',
        sqlQuery: 'SELECT 1',
      } as never,
      { limit: 10 }
    );

    expect(query).toBe('SELECT * FROM (SELECT 1) LIMIT 10');
  });
});

describe('DatabricksQueryBuilder — output controls guard', () => {
  const builder = new DatabricksQueryBuilder();
  const tableDef = { type: 'table', fullyQualifiedName: 'catalog.schema.tbl' } as any;

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
