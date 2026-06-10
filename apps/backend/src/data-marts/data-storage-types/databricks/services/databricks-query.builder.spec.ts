import { DatabricksQueryBuilder } from './databricks-query.builder';
import { DatabricksClauseRenderer } from './databricks-clause-renderer';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';

const sqlDef = { sqlQuery: 'SELECT 1;' } as unknown as DataMartDefinition;
const tableDef = { fullyQualifiedName: 'cat.sch.events' } as unknown as DataMartDefinition;

function build() {
  return new DatabricksQueryBuilder(new DatabricksClauseRenderer());
}

describe('DatabricksQueryBuilder', () => {
  it('builds a plain SELECT with no output controls', () => {
    expect(build().buildQuery(tableDef, {})).toBe('SELECT * FROM `cat`.`sch`.`events`');
  });

  it('wraps a SQL definition with limit (legacy schema-probe path), trailing semicolon stripped', () => {
    expect(build().buildQuery(sqlDef, { limit: 0 })).toBe('SELECT * FROM (SELECT 1)\nLIMIT 0');
    expect(build().buildQuery(sqlDef, { limit: 10 })).toBe('SELECT * FROM (SELECT 1)\nLIMIT 10');
  });

  it('applies filters, sort and limit via the clause renderer', () => {
    const sql = build().buildQuery(tableDef, {
      columns: ['id', 'created_at'],
      filters: [{ column: 'created_at', operator: 'gte', value: '2024-01-01' }],
      sort: [{ column: 'id', direction: 'desc' }],
      limit: 100,
      columnTypes: new Map([['created_at', 'TIMESTAMP']]),
    });
    expect(sql).toContain('SELECT `id`, `created_at` FROM `cat`.`sch`.`events`');
    expect(sql).toContain("WHERE `created_at` >= CAST('2024-01-01' AS TIMESTAMP)");
    expect(sql).toContain('ORDER BY `id` DESC');
    expect(sql).toContain('LIMIT 100');
  });

  it('prefers mainTableReference as the FROM for SQL definitions under output controls', () => {
    const sql = build().buildQuery(sqlDef, {
      filters: [{ column: 'a', operator: 'eq', value: 1 }],
      mainTableReference: 'cat.sch.my_view',
    });
    expect(sql).toContain('FROM cat.sch.my_view');
    expect(sql).toContain('WHERE `a` = 1');
  });

  it('still works without options', () => {
    expect(build().buildQuery(tableDef)).toBeDefined();
  });

  it('throws for table-pattern definitions under output controls', () => {
    const patternDef = { pattern: 'ev_' } as unknown as DataMartDefinition;
    expect(() => build().buildQuery(patternDef, { limit: 1 })).toThrow();
  });
});
