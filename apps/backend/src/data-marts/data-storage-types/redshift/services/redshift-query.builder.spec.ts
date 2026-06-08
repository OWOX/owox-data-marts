import { RedshiftClauseRenderer } from './redshift-clause-renderer';
import { RedshiftQueryBuilder } from './redshift-query.builder';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';

describe('RedshiftQueryBuilder', () => {
  const tableDef = { type: 'table', fullyQualifiedName: 'db.events' } as any;
  const sqlDef = { sqlQuery: 'SELECT a FROM t' } as unknown as DataMartDefinition;

  it('still builds a plain query when no controls are present', () => {
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    expect(builder.buildQuery(tableDef)).toBe('SELECT * FROM "db"."events"');
  });

  it('builds an exact LIMIT 0 schema-probe query (via the OC branch)', () => {
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    expect(builder.buildQuery(tableDef, { limit: 0 })).toBe('SELECT * FROM "db"."events"\nLIMIT 0');
  });

  it('emits WHERE/ORDER BY/LIMIT with inlined literals for a TABLE def', () => {
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    const sql = builder.buildQuery(tableDef, {
      filters: [{ column: 'status', operator: 'eq', value: 'active' }],
      sort: [{ column: 'created_at', direction: 'desc' }],
      limit: 50,
    });
    expect(sql).toBe(
      `SELECT * FROM "db"."events"\nWHERE "status" = 'active'\nORDER BY "created_at" DESC\nLIMIT 50`
    );
  });

  it('emits WHERE only when no sort or limit', () => {
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    const sql = builder.buildQuery(tableDef, {
      filters: [{ column: 'status', operator: 'eq', value: 'active' }],
    });
    expect(sql).toBe(`SELECT * FROM "db"."events"\nWHERE "status" = 'active'`);
  });

  it('wraps a SQL-def in parens when output controls have no mainTableReference', () => {
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    const sql = builder.buildQuery(sqlDef, {
      filters: [{ column: 'a', operator: 'eq', value: 1 }],
    });
    expect(sql).toBe(`SELECT * FROM (SELECT a FROM t) AS subq\nWHERE "a" = 1`);
  });

  it('uses mainTableReference for a SQL-def with output controls', () => {
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    const sql = builder.buildQuery(sqlDef, {
      filters: [{ column: 'a', operator: 'eq', value: 1 }],
      mainTableReference: '"myschema"."__view_abc"',
    });
    expect(sql).toContain('FROM "myschema"."__view_abc"');
    expect(sql).not.toContain('SELECT a FROM t');
  });
});
