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
    expect(sql).toBe('SELECT *\nFROM db."sc"."events"');
  });

  it('applies filters, sort and limit via the clause renderer', () => {
    const sql = build().buildQuery(tableDef, {
      columns: ['id', 'created_at'],
      filters: [{ column: 'created_at', operator: 'gte', value: '2024-01-01' }],
      sort: [{ column: 'id', direction: 'desc' }],
      limit: 100,
      columnTypes: new Map([['created_at', 'TIMESTAMP']]),
    });
    expect(sql).toContain('SELECT\n  "id",\n  "created_at"\nFROM db."sc"."events"');
    expect(sql).toContain(`WHERE "created_at" >= CAST('2024-01-01' AS TIMESTAMP)`);
    expect(sql).toContain('ORDER BY\n  "id" DESC');
    expect(sql).toContain('LIMIT 100');
  });

  it('safely quotes a malicious column name in the SELECT list', () => {
    const sql = build().buildQuery(tableDef, { columns: ['a.b.c.d OR 1=1 --'] });
    expect(sql).toBe('SELECT\n  "a"."b"."c"."d OR 1=1 --"\nFROM db."sc"."events"');
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

  // The calculated-metric flip is a per-dialect copy of the same two gates (output-controls
  // path, then aggregated path), and a copy is not self-verifying: the legacy BigQuery builder
  // shipped with `calculatedFields` missing from its own gate, emitting SQL without the metric
  // while the header was still synthesized. Pinned per dialect so the next copy cannot repeat it.
  it('routes a calculated-metric-only request onto the aggregated path', () => {
    const sql = build().buildQuery(tableDef, {
      columns: ['country'],
      calculatedFields: [
        {
          outputName: 'ctr',
          type: 'FLOAT',
          formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
          level: 'metric',
        },
      ],
    });
    expect(sql).toContain('SUM("clicks") / NULLIF(SUM("impressions"), 0) AS "ctr"');
    // Projected, never grouped — the metric already IS an aggregate.
    expect(sql).toContain('GROUP BY\n  "country"');
    expect(sql).not.toContain('GROUP BY\n  "country",\n  "ctr"');
  });

  // A row-level formula is a dimension, not an aggregate: it must not force the grouped shape,
  // or a plain projection silently becomes an implicit DISTINCT over the report's columns. It is
  // still projected — the plain path is where its formula gets substituted.
  it('projects a row-level calculated field without grouping', () => {
    const sql = build().buildQuery(tableDef, {
      columns: ['country'],
      sort: [{ column: 'session_key', direction: 'asc' }],
      calculatedFields: [
        {
          outputName: 'session_key',
          type: 'VARCHAR',
          formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
          level: 'column',
        },
      ],
    });
    expect(sql).toContain(
      'SELECT\n  "country",\n  CONCAT("session_id", "user_id") AS "session_key"'
    );
    expect(sql).toContain('ORDER BY\n  "session_key" ASC');
    expect(sql).not.toContain('GROUP BY');
  });

  // The field alone: `SELECT *, <expr>` would widen the report to every warehouse column, which
  // the aggregated sibling never does for the same selection.
  it('projects a row-level calculated field alone, without a wildcard', () => {
    const sql = build().buildQuery(tableDef, {
      columns: [],
      calculatedFields: [
        {
          outputName: 'session_key',
          type: 'VARCHAR',
          formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
          level: 'column',
        },
      ],
    });
    expect(sql).toContain('SELECT\n  CONCAT("session_id", "user_id") AS "session_key"');
    expect(sql).not.toContain('*');
  });

  // Ported from bigquery-query.builder.spec.ts. All five builders carry the same line —
  // `hasAggregateCalculatedField([...calculatedFields, ...calculatedFilterMetrics])` — and it was
  // asserted on two of them. Drop `calculatedFilterMetrics` from the spread here and this dialect
  // takes the PLAIN branch, where `assertNoHavingRules` throws a bare Error: a 500 for an ordinary
  // report ("countries where CTR > 0.5, without showing CTR").
  it('groups the query for an aggregate-level filter on a field it does not select', () => {
    const sql = build().buildQuery(tableDef, {
      columns: ['country'],
      filters: [{ column: 'ctr', operator: 'gt', value: 0.5, clause: 'having' }],
      calculatedFilterMetrics: [
        {
          outputName: 'ctr',
          type: 'FLOAT',
          formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
          level: 'metric' as const,
        },
      ],
    } as never);
    expect(sql).toContain('GROUP BY\n  "country"');
    expect(sql).toMatch(/HAVING/);
    // Filtered, not selected: the field must not reach the projection.
    expect(sql).not.toContain('AS "ctr"');
  });
});
