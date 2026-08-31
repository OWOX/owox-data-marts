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
    expect(build().buildQuery(tableDef, {})).toBe('SELECT *\nFROM `cat`.`sch`.`events`');
  });

  it('wraps a SQL definition with limit (legacy schema-probe path), trailing semicolon stripped', () => {
    expect(build().buildQuery(sqlDef, { limit: 0 })).toBe(
      'SELECT *\nFROM (SELECT 1) AS subq\nLIMIT 0'
    );
    expect(build().buildQuery(sqlDef, { limit: 10 })).toBe(
      'SELECT *\nFROM (SELECT 1) AS subq\nLIMIT 10'
    );
  });

  it('wraps the raw SQL as an aliased subquery when no mainTableReference is supplied (SQL def + filters)', () => {
    const sql = build().buildQuery(sqlDef, {
      filters: [{ column: 'a', operator: 'eq', value: 1 }],
    });
    expect(sql).toContain('FROM (SELECT 1) AS subq');
    expect(sql).toContain('WHERE `a` = 1');
  });

  it('applies filters, sort and limit via the clause renderer', () => {
    const sql = build().buildQuery(tableDef, {
      columns: ['id', 'created_at'],
      filters: [{ column: 'created_at', operator: 'gte', value: '2024-01-01' }],
      sort: [{ column: 'id', direction: 'desc' }],
      limit: 100,
      columnTypes: new Map([['created_at', 'TIMESTAMP']]),
    });
    expect(sql).toContain('SELECT\n  `id`,\n  `created_at`\nFROM `cat`.`sch`.`events`');
    expect(sql).toContain("WHERE `created_at` >= CAST('2024-01-01' AS TIMESTAMP)");
    expect(sql).toContain('ORDER BY\n  `id` DESC');
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
          type: 'DOUBLE',
          formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
          level: 'metric',
        },
      ],
    });
    expect(sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
    // Projected, never grouped — the metric already IS an aggregate.
    expect(sql).toContain('GROUP BY\n  `country`');
    expect(sql).not.toContain('GROUP BY\n  `country`,\n  `ctr`');
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
          type: 'STRING',
          formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
          level: 'column',
        },
      ],
    });
    expect(sql).toContain(
      'SELECT\n  `country`,\n  CONCAT(`session_id`, `user_id`) AS `session_key`'
    );
    expect(sql).toContain('ORDER BY\n  `session_key` ASC');
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
          type: 'STRING',
          formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
          level: 'column',
        },
      ],
    });
    expect(sql).toBe(
      'SELECT\n  CONCAT(`session_id`, `user_id`) AS `session_key`\nFROM `cat`.`sch`.`events`'
    );
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
          type: 'DOUBLE',
          formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
          level: 'metric' as const,
        },
      ],
    } as never);
    expect(sql).toContain('GROUP BY\n  `country`');
    expect(sql).toMatch(/HAVING/);
    // Filtered, not selected: the field must not reach the projection.
    expect(sql).not.toContain('AS `ctr`');
  });
});
