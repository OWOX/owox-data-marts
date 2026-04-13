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
