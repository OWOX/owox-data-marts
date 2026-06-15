import { SnowflakeQueryBuilder } from './snowflake-query.builder';
import { SnowflakeClauseRenderer } from './snowflake-clause-renderer';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';

const tableDef = {
  definitionType: 'TABLE',
  fullyQualifiedName: 'db.sc.events',
} as unknown as DataMartDefinition;

const sqlDef = {
  definitionType: 'SQL',
  sqlQuery: 'SELECT id, created_at FROM raw',
} as unknown as DataMartDefinition;

function build() {
  return new SnowflakeQueryBuilder(new SnowflakeClauseRenderer());
}

describe('SnowflakeQueryBuilder', () => {
  it('builds a plain SELECT with no output controls', () => {
    const sql = build().buildQuery(tableDef, {});
    expect(sql).toBe('SELECT * FROM db."sc"."events"');
  });

  it('applies filters, sort and limit via the clause renderer', () => {
    const sql = build().buildQuery(tableDef, {
      columns: ['id', 'created_at'],
      filters: [{ column: 'created_at', operator: 'gte', value: '2024-01-01' }],
      sort: [{ column: 'id', direction: 'desc' }],
      limit: 100,
      columnTypes: new Map([['created_at', 'TIMESTAMP']]),
    });
    expect(sql).toContain('SELECT "id", "created_at" FROM db."sc"."events"');
    expect(sql).toContain(`WHERE "created_at" >= CAST('2024-01-01' AS TIMESTAMP)`);
    expect(sql).toContain('ORDER BY "id" DESC');
    expect(sql).toContain('LIMIT 100');
  });

  it('safely quotes a malicious column name in the SELECT list', () => {
    const sql = build().buildQuery(tableDef, { columns: ['a.b.c.d OR 1=1 --'] });
    expect(sql).toBe('SELECT "a"."b"."c"."d OR 1=1 --" FROM db."sc"."events"');
  });

  it('uses mainTableReference as the FROM for a SQL-def mart with output controls', () => {
    const sql = build().buildQuery(sqlDef, {
      filters: [{ column: 'id', operator: 'gt', value: 0 }],
      mainTableReference: 'db."sc"."view_x"',
    });
    expect(sql).toContain('FROM db."sc"."view_x"');
    expect(sql).not.toContain('SELECT id, created_at FROM raw');
    expect(sql).toContain('WHERE "id" > 0');
  });

  it('wraps the raw SQL when no mainTableReference is supplied', () => {
    const sql = build().buildQuery(sqlDef, {
      filters: [{ column: 'id', operator: 'gt', value: 0 }],
    });
    expect(sql).toContain('FROM (SELECT id, created_at FROM raw)');
  });

  it('still throws for table-pattern definitions', () => {
    const patternDef = {
      definitionType: 'TABLE_PATTERN',
      pattern: 'ev_',
    } as unknown as DataMartDefinition;
    expect(() => build().buildQuery(patternDef, { limit: 1 })).toThrow();
  });
});
