import { AthenaQueryBuilder } from './athena-query.builder';
import { AthenaClauseRenderer } from './athena-clause-renderer';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';

function tableDefinition(fqn: string): DataMartDefinition {
  return { fullyQualifiedName: fqn } as unknown as DataMartDefinition;
}

function sqlDefinition(query: string): DataMartDefinition {
  return { sqlQuery: query } as unknown as DataMartDefinition;
}

function connectorDefinition(fqn: string): DataMartDefinition {
  return {
    connector: {
      source: { name: 'src', configuration: [{}], node: 'n', fields: ['f'] },
      storage: { fullyQualifiedName: fqn },
    },
  } as unknown as DataMartDefinition;
}

describe('AthenaQueryBuilder output controls', () => {
  const builder = new AthenaQueryBuilder(new AthenaClauseRenderer());

  it('returns plain string when no output controls', () => {
    const out = builder.buildQuery(tableDefinition('mydb.orders'));
    expect(typeof out).toBe('string');
  });

  it('emits WHERE/ORDER BY/LIMIT with positional params for output controls', () => {
    const out = builder.buildQuery(tableDefinition('mydb.orders'), {
      filters: [{ column: 'status', operator: 'eq', value: 'paid' }],
      sort: [{ column: 'created_at', direction: 'desc' }],
      limit: 50,
    });
    expect(typeof out).toBe('object');
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toContain('WHERE "status" = ?');
    expect(out.sql).toContain('ORDER BY\n  "created_at" DESC');
    expect(out.sql).toContain('LIMIT 50');
    expect(out.params).toEqual([{ name: 'p0', value: 'paid' }]);
  });

  it('casts date/time filter placeholders using columnTypes, leaves others bare', () => {
    const out = builder.buildQuery(tableDefinition('mydb.orders'), {
      filters: [
        { column: 'created_at', operator: 'gte', value: '2024-01-01' },
        { column: 'status', operator: 'eq', value: 'paid' },
      ],
      columnTypes: new Map([
        ['created_at', 'TIMESTAMP'],
        ['status', 'VARCHAR'],
      ]),
    });
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toContain('"created_at" >= CAST(? AS TIMESTAMP)');
    expect(out.sql).toContain('"status" = ?');
    expect(out.params).toEqual([
      { name: 'p0', value: '2024-01-01' },
      { name: 'p1', value: 'paid' },
    ]);
  });

  it('leaves placeholders bare when columnTypes is absent', () => {
    const out = builder.buildQuery(tableDefinition('mydb.orders'), {
      filters: [{ column: 'created_at', operator: 'gte', value: '2024-01-01' }],
    });
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toContain('"created_at" >= ?');
    expect(out.sql).not.toContain('CAST');
  });

  it('returns plain string for table definition without output controls', () => {
    const out = builder.buildQuery(tableDefinition('db.schema.tbl'));
    expect(out).toBe('SELECT *\nFROM "db"."schema"."tbl"');
  });

  it('returns plain string for sql definition without columns', () => {
    const out = builder.buildQuery(sqlDefinition('SELECT a FROM t'));
    expect(out).toBe('SELECT a FROM t');
  });

  it('wraps sql definition when columns are provided (no output controls)', () => {
    const out = builder.buildQuery(sqlDefinition('SELECT a, b FROM t;'), {
      columns: ['a'],
    });
    expect(out).toBe('SELECT\n  "a"\nFROM (SELECT a, b FROM t)');
  });

  it('composes WHERE + ORDER BY + LIMIT in correct order', () => {
    const out = builder.buildQuery(tableDefinition('db.tbl'), {
      filters: [{ column: 'a', operator: 'eq', value: 1 }],
      sort: [{ column: 'a', direction: 'asc' }],
      limit: 10,
    });
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    const sql = out.sql;
    expect(sql.indexOf('WHERE')).toBeLessThan(sql.indexOf('ORDER BY'));
    expect(sql.indexOf('ORDER BY')).toBeLessThan(sql.indexOf('LIMIT'));
    expect(sql).toContain('ORDER BY\n  "a" ASC');
    expect(sql).toContain('LIMIT 10');
  });

  it('uses mainTableReference for SQL-def with output controls', () => {
    const out = builder.buildQuery(sqlDefinition('SELECT 1'), {
      columns: ['x'],
      filters: [{ column: 'x', operator: 'is_empty' }],
      mainTableReference: '"proj"."ds"."view_abc"',
    });
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toContain('FROM "proj"."ds"."view_abc"');
    expect(out.sql).not.toContain('SELECT 1');
    expect(out.sql).toContain('("x" IS NULL OR "x" = \'\')');
  });

  it('wraps SQL-def when output controls have no mainTableReference (fallback)', () => {
    const out = builder.buildQuery(sqlDefinition('SELECT 1'), {
      filters: [{ column: 'x', operator: 'is_empty' }],
    });
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toContain('FROM (SELECT 1)');
    expect(out.sql).toContain('("x" IS NULL OR "x" = \'\')');
  });

  it('wraps SQL-defined data mart for the limit:0 schema probe (no mainTableReference)', () => {
    const sqlDef = { sqlQuery: 'SELECT a, b FROM t' } as unknown as DataMartDefinition;
    const out = builder.buildQuery(sqlDef, { limit: 0 });
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toBe('SELECT *\nFROM (SELECT a, b FROM t)\nLIMIT 0');
    expect(out.params).toEqual([]);
  });

  it('uses mainTableReference for SQL-defined data mart with output controls', () => {
    const sqlDef = { sqlQuery: 'SELECT a FROM t' } as unknown as DataMartDefinition;
    const out = builder.buildQuery(sqlDef, {
      filters: [{ column: 'a', operator: 'eq', value: 1 }],
      mainTableReference: '"db"."__internal_view"',
    });
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toContain('FROM "db"."__internal_view"');
    expect(out.sql).toContain('WHERE "a" = ?');
  });

  it('returns QueryBuildResult with correct FROM for connector definition', () => {
    const out = builder.buildQuery(connectorDefinition('db.schema.tbl'), {
      filters: [{ column: 'a', operator: 'eq', value: 1 }],
    });
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toContain('FROM "db"."schema"."tbl"');
  });

  it('handles limit-only output control', () => {
    const out = builder.buildQuery(tableDefinition('db.tbl'), { limit: 5 });
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toContain('LIMIT 5');
    expect(out.params).toEqual([]);
  });

  it('multiple filters combine with AND in WHERE, params in textual order', () => {
    const out = builder.buildQuery(tableDefinition('db.tbl'), {
      filters: [
        { column: 'name', operator: 'eq', value: 'alice' },
        { column: 'id', operator: 'gt', value: 42 },
      ],
    });
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toContain('WHERE "name" = ?\n  AND "id" > ?');
    expect(out.params).toEqual([
      { name: 'p0', value: 'alice' },
      { name: 'p1', value: 42 },
    ]);
  });

  it('multiple filters on the same column both appear in WHERE', () => {
    const out = builder.buildQuery(tableDefinition('db.tbl'), {
      filters: [
        { column: 'id', operator: 'gte', value: 2 },
        { column: 'id', operator: 'lte', value: 9 },
      ],
    });
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toContain('WHERE "id" >= ?\n  AND "id" <= ?');
    expect((out.params ?? []).map(p => p.value)).toEqual([2, 9]);
  });

  it('filter-only column: SELECT contains only specified columns; WHERE references unselected filter column', () => {
    // "hidden_col" is used as a filter target but is NOT in queryOptions.columns.
    // The SELECT list must contain only the columns that were explicitly selected,
    // while the WHERE clause still references the filter column.
    const out = builder.buildQuery(tableDefinition('db.tbl'), {
      columns: ['name', 'amount'],
      filters: [{ column: 'hidden_col', operator: 'eq', value: 'secret' }],
    });
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    // SELECT must only include the two explicitly requested columns
    expect(out.sql).toContain('"name",\n  "amount"');
    expect(out.sql).not.toMatch(/SELECT.*"hidden_col"/);
    // WHERE must still reference the filter column
    expect(out.sql).toContain('WHERE "hidden_col" = ?');
    expect(out.params).toEqual([{ name: 'p0', value: 'secret' }]);
  });

  // The calculated-metric flip is a per-dialect copy of the same two gates (output-controls
  // path, then aggregated path), and a copy is not self-verifying: the legacy BigQuery builder
  // shipped with `calculatedFields` missing from its own gate, emitting SQL without the metric
  // while the header was still synthesized. Pinned per dialect so the next copy cannot repeat it.
  it('routes a calculated-metric-only request onto the aggregated path', () => {
    const out = builder.buildQuery(tableDefinition('db.tbl'), {
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
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toContain('SUM("clicks") / NULLIF(SUM("impressions"), 0) AS "ctr"');
    // Projected, never grouped — the metric already IS an aggregate.
    expect(out.sql).toContain('GROUP BY\n  "country"');
    expect(out.sql).not.toContain('GROUP BY\n  "country",\n  "ctr"');
  });

  // A row-level formula is a dimension, not an aggregate: it must not force the grouped shape,
  // or a plain projection silently becomes an implicit DISTINCT over the report's columns. It is
  // still projected — the plain path is where its formula gets substituted.
  it('projects a row-level calculated field without grouping', () => {
    const out = builder.buildQuery(tableDefinition('db.tbl'), {
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
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toContain(
      'SELECT\n  "country",\n  CONCAT("session_id", "user_id") AS "session_key"'
    );
    expect(out.sql).toContain('ORDER BY\n  "session_key" ASC');
    expect(out.sql).not.toContain('GROUP BY');
  });

  // The field alone: `SELECT *, <expr>` would widen the report to every warehouse column, which
  // the aggregated sibling never does for the same selection.
  it('projects a row-level calculated field alone, without a wildcard', () => {
    const out = builder.buildQuery(tableDefinition('db.tbl'), {
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
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toContain('SELECT\n  CONCAT("session_id", "user_id") AS "session_key"');
    expect(out.sql).not.toContain('*');
  });

  // Ported from bigquery-query.builder.spec.ts. All five builders carry the same line —
  // `hasAggregateCalculatedField([...calculatedFields, ...calculatedFilterMetrics])` — and it was
  // asserted on two of them. Drop `calculatedFilterMetrics` from the spread here and this dialect
  // takes the PLAIN branch, where `assertNoHavingRules` throws a bare Error: a 500 for an ordinary
  // report ("countries where CTR > 0.5, without showing CTR"). Nothing else in this suite reaches
  // the predicate, so the flip has to be asserted per dialect or it is asserted nowhere.
  it('groups the query for an aggregate-level filter on a field it does not select', () => {
    const out = builder.buildQuery(tableDefinition('db.tbl'), {
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
    if (typeof out === 'string') throw new Error('expected QueryBuildResult');
    expect(out.sql).toContain('GROUP BY\n  "country"');
    expect(out.sql).toMatch(/HAVING/);
    // Filtered, not selected: the field must not reach the projection.
    expect(out.sql).not.toContain('AS "ctr"');
  });
});
