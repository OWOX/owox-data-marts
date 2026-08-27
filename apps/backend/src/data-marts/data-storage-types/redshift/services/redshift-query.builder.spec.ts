import { RedshiftClauseRenderer } from './redshift-clause-renderer';
import { RedshiftQueryBuilder } from './redshift-query.builder';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';

describe('RedshiftQueryBuilder', () => {
  const tableDef = { type: 'table', fullyQualifiedName: 'db.events' } as any;
  const sqlDef = { sqlQuery: 'SELECT a FROM t' } as unknown as DataMartDefinition;

  it('still builds a plain query when no controls are present', () => {
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    expect(builder.buildQuery(tableDef)).toBe('SELECT *\nFROM "db"."events"');
  });

  it('builds an exact LIMIT 0 schema-probe query (via the OC branch)', () => {
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    expect(builder.buildQuery(tableDef, { limit: 0 })).toBe(
      'SELECT *\nFROM "db"."events"\nLIMIT 0'
    );
  });

  it('emits WHERE/ORDER BY/LIMIT with inlined literals for a TABLE def', () => {
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    const sql = builder.buildQuery(tableDef, {
      filters: [{ column: 'status', operator: 'eq', value: 'active' }],
      sort: [{ column: 'created_at', direction: 'desc' }],
      limit: 50,
    });
    expect(sql).toBe(
      `SELECT *\nFROM "db"."events"\nWHERE "status" = 'active'\nORDER BY\n  "created_at" DESC\nLIMIT 50`
    );
  });

  it('emits WHERE only when no sort or limit', () => {
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    const sql = builder.buildQuery(tableDef, {
      filters: [{ column: 'status', operator: 'eq', value: 'active' }],
    });
    expect(sql).toBe(`SELECT *\nFROM "db"."events"\nWHERE "status" = 'active'`);
  });

  it('wraps a SQL-def in parens when output controls have no mainTableReference', () => {
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    const sql = builder.buildQuery(sqlDef, {
      filters: [{ column: 'a', operator: 'eq', value: 1 }],
    });
    expect(sql).toBe(`SELECT *\nFROM (SELECT a FROM t) AS subq\nWHERE "a" = 1`);
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

  // The calculated-metric flip is a per-dialect copy of the same two gates (output-controls
  // path, then aggregated path), and a copy is not self-verifying: the legacy BigQuery builder
  // shipped with `calculatedFields` missing from its own gate, emitting SQL without the metric
  // while the header was still synthesized. Pinned per dialect so the next copy cannot repeat it.
  it('routes a calculated-metric-only request onto the aggregated path', () => {
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    const sql = builder.buildQuery(tableDef, {
      columns: ['country'],
      calculatedFields: [
        {
          outputName: 'ctr',
          type: 'DOUBLE PRECISION',
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
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    const sql = builder.buildQuery(tableDef, {
      columns: ['country'],
      sort: [{ column: 'session_key', direction: 'asc' }],
      calculatedFields: [
        {
          outputName: 'session_key',
          type: 'VARCHAR',
          formula: '{{ref field="session_id"}} || \'-\' || {{ref field="user_id"}}',
          level: 'column',
        },
      ],
    });
    expect(sql).toContain(
      'SELECT\n  "country",\n  "session_id" || \'-\' || "user_id" AS "session_key"'
    );
    expect(sql).toContain('ORDER BY\n  "session_key" ASC');
    expect(sql).not.toContain('GROUP BY');
  });

  // The field alone: `SELECT *, <expr>` would widen the report to every warehouse column, which
  // the aggregated sibling never does for the same selection.
  it('projects a row-level calculated field alone, without a wildcard', () => {
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    const sql = builder.buildQuery(tableDef, {
      columns: [],
      calculatedFields: [
        {
          outputName: 'session_key',
          type: 'VARCHAR',
          formula: '{{ref field="session_id"}} || \'-\' || {{ref field="user_id"}}',
          level: 'column',
        },
      ],
    });
    expect(sql).toContain('SELECT\n  "session_id" || \'-\' || "user_id" AS "session_key"');
    expect(sql).not.toContain('*');
  });

  // The seam this builder left dead at BOTH ends. It passed
  // `resolveColumnType: undefined` and no fragment read a type, so the probe's shape 1 came out as
  // `WHERE ("n_prefix" || "n_suffix") > 5`, which Redshift compares LEXICOGRAPHICALLY: `9` came
  // back where `9, 10, 100` is correct, with no error and no NULL. Asserted at the BUILDER rather
  // than at the renderer because the value's cast appears only when the resolver is wired.
  describe('a filter on a calculated field imposes the declared type', () => {
    const probePlan = (type: string) => ({
      outputName: 'probe',
      type,
      formula: '{{ref field="n_prefix"}} || {{ref field="n_suffix"}}',
      level: 'column' as const,
    });

    it('casts both sides of the probe shape that returned 9 where 9, 10, 100 is correct', () => {
      const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
      const sql = builder.buildQuery(tableDef, {
        columns: ['channel'],
        filters: [{ column: 'probe', operator: 'gt', value: 5, clause: 'where' }],
        calculatedFilterMetrics: [probePlan('DOUBLE PRECISION')],
      });

      expect(sql).toContain(
        'WHERE CAST(("n_prefix" || "n_suffix") AS DOUBLE PRECISION) > ' +
          'CAST(5 AS DOUBLE PRECISION)'
      );
      expect(sql).not.toContain('"probe"');
    });

    // The AGGREGATED branch passes its own `resolveColumnType`, so it is a second place the seam
    // can be left dead — and the one an aggregate-level field's HAVING and the Totals restriction
    // both go through.
    it('casts both sides in HAVING on the aggregated branch too', () => {
      const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
      const sql = builder.buildQuery(tableDef, {
        columns: ['channel'],
        filters: [{ column: 'roas', operator: 'gt', value: 1.5, clause: 'having' }],
        calculatedFilterMetrics: [
          {
            outputName: 'roas',
            type: 'DOUBLE PRECISION',
            formula: 'SUM({{ref field="revenue"}}) / NULLIF(SUM({{ref field="cost"}}), 0)',
            level: 'metric' as const,
          },
        ],
      });

      expect(sql).toContain(
        'HAVING CAST((SUM("revenue") / NULLIF(SUM("cost"), 0)) AS DOUBLE PRECISION) > ' +
          'CAST(1.5 AS DOUBLE PRECISION)'
      );
    });

    // The no-op half at the same seat: an ordinary column's type reaches the fragment and changes
    // nothing, so every non-calculated filter this dialect ships is byte-identical.
    it('leaves an ordinary column filter byte-identical now that a resolver is supplied', () => {
      const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
      const sql = builder.buildQuery(tableDef, {
        filters: [{ column: 'created_at', operator: 'gte', value: '2026-07-01' }],
        columnTypes: new Map([['created_at', 'DATE']]),
      });

      expect(sql).toContain(`WHERE "created_at" >= '2026-07-01'`);
    });
  });

  // Ported from bigquery-query.builder.spec.ts. All five builders carry the same line —
  // `hasAggregateCalculatedField([...calculatedFields, ...calculatedFilterMetrics])` — and it was
  // asserted on two of them. Drop `calculatedFilterMetrics` from the spread here and this dialect
  // takes the PLAIN branch, where `assertNoHavingRules` throws a bare Error: a 500 for an ordinary
  // report ("countries where CTR > 0.5, without showing CTR").
  it('groups the query for an aggregate-level filter on a field it does not select', () => {
    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    const sql = builder.buildQuery(tableDef, {
      columns: ['country'],
      filters: [{ column: 'ctr', operator: 'gt', value: 0.5, clause: 'having' }],
      calculatedFilterMetrics: [
        {
          outputName: 'ctr',
          type: 'DOUBLE PRECISION',
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
