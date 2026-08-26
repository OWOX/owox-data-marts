/**
 * The Totals group restriction, across EVERY dialect and every report shape.
 *
 * The unit coverage this replaces exercised one shape on one dialect — a string dimension, no
 * calendar bucket, on the only builder that aliases and qualifies its FROM — which is exactly the
 * shape that works. Each block below is a shape a real report produces and that shape alone used
 * to emit either invalid SQL or a silently wrong number, so they are grouped by the defect rather
 * than by dialect.
 */
import { AthenaClauseRenderer } from '../athena/services/athena-clause-renderer';
import { BigQueryClauseRenderer } from '../bigquery/services/bigquery-clause-renderer';
import { DatabricksClauseRenderer } from '../databricks/services/databricks-clause-renderer';
import { RedshiftClauseRenderer } from '../redshift/services/redshift-clause-renderer';
import { SnowflakeClauseRenderer } from '../snowflake/services/snowflake-clause-renderer';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { GroupRestriction } from '../../dto/domain/group-restriction';
import { CalculatedFieldPlan, SqlClauseRenderer } from './sql-clause-renderer';
import { buildKeptGroupsJoinPairs, buildKeptGroupsProjection } from './kept-groups.utils';
import { AthenaQueryBuilder } from '../athena/services/athena-query.builder';
import { BigQueryQueryBuilder } from '../bigquery/services/bigquery-query.builder';
import { DatabricksQueryBuilder } from '../databricks/services/databricks-query.builder';
import { RedshiftQueryBuilder } from '../redshift/services/redshift-query.builder';
import { SnowflakeQueryBuilder } from '../snowflake/services/snowflake-query.builder';
import {
  DataMartQueryOptions,
  QueryBuildResult,
} from '../interfaces/data-mart-query-builder.interface';

/** Flat builders return either raw SQL or a params envelope, depending on how the dialect binds. */
const asSql = (built: string | QueryBuildResult): string =>
  typeof built === 'string' ? built : built.sql;

const HAVING_RULE = {
  column: 'revenue',
  function: 'SUM',
  operator: 'gt',
  value: 1000,
} as unknown as FilterRule;

/** A ROW-LEVEL calculated field: a real grouping key of the report, with no column behind it. */
const SESSION_KEY_PLAN: CalculatedFieldPlan = {
  outputName: 'session_key',
  type: 'STRING',
  level: 'column',
  formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
};

/** The same, declared DATE — the shape a report may bucket by month. */
const VISIT_DAY_PLAN: CalculatedFieldPlan = {
  outputName: 'visit_day',
  type: 'DATE',
  level: 'column',
  formula: 'DATE({{ref field="visit_ts"}})',
};

/**
 * Every dialect, with the quoting it actually emits and the FROM shape its builder passes.
 * BigQuery is the only one that aliases its source and qualifies columns; the other four select
 * bare names off an unaliased table reference, which is what made an ambiguous projection fatal.
 */
const DIALECTS: {
  name: string;
  renderer: () => SqlClauseRenderer;
  fromClause: string;
  qualifyColumn?: (column: string) => string;
  /** How this dialect writes a bare column reference inside the restriction subquery. */
  ref: (column: string) => string;
}[] = [
  {
    name: 'BigQuery',
    renderer: () => new BigQueryClauseRenderer(),
    fromClause: '`p.d.t` AS src',
    qualifyColumn: c => `src.\`${c}\``,
    ref: c => `src.\`${c}\``,
  },
  {
    name: 'Athena',
    renderer: () => new AthenaClauseRenderer(),
    fromClause: '"db"."tbl"',
    ref: c => `"${c}"`,
  },
  {
    name: 'Snowflake',
    renderer: () => new SnowflakeClauseRenderer(),
    fromClause: '"DB"."SC"."TBL"',
    ref: c => `"${c}"`,
  },
  {
    name: 'Redshift',
    renderer: () => new RedshiftClauseRenderer(),
    fromClause: '"sc"."tbl"',
    ref: c => `"${c}"`,
  },
  {
    name: 'Databricks',
    renderer: () => new DatabricksClauseRenderer(),
    fromClause: '`cat`.`sc`.`tbl`',
    ref: c => `\`${c}\``,
  },
];

const render = (
  d: (typeof DIALECTS)[number],
  restriction: GroupRestriction | undefined,
  extra: { filters?: FilterRule[]; typeByColumn?: ReadonlyMap<string, string> } = {}
) =>
  d.renderer().renderKeptGroupsJoin({
    restriction,
    fromClause: d.fromClause,
    filters: extra.filters ?? [],
    qualifyColumn: d.qualifyColumn,
    typeByColumn: extra.typeByColumn,
    resolveColumnType: undefined,
  });

describe('kept-groups restriction', () => {
  describe.each(DIALECTS)('$name', d => {
    it('is absent entirely when the report has no metric filter', () => {
      expect(render(d, undefined).sql).toBe('');
      expect(render(d, { dimensions: ['channel'], having: [] }).sql).toBe('');
    });

    // The defect: four of the five dialects select bare column names off an unaliased FROM, so a
    // subquery projecting `channel` alongside it makes the outer `channel` resolve against two
    // relations — AMBIGUOUS_ATTRIBUTE on Trino, "ambiguous column name" on Snowflake, and so on.
    // Totals would fail outright on those engines for EVERY report with a metric filter.
    it('projects the group key under a private alias, never under the dimension name', () => {
      const { sql } = render(d, { dimensions: ['channel'], having: [HAVING_RULE] });

      const subquery = sql.slice(0, sql.lastIndexOf(') AS'));
      expect(subquery).toContain(`${d.ref('channel')} AS `);
      expect(subquery).toContain('_owox_kg_0');
      // Nothing the subquery EXPOSES is named after a real column: the only place the dimension
      // name appears is the input expression, which is scoped to the subquery's own FROM.
      expect(subquery).not.toMatch(/AS\s+["`]?channel/i);
      expect(sql).toContain('_owox_kg_0');
    });

    // The defect: the restriction was regrouped with the CURRENT query's date buckets, and a
    // Totals query has none — so a report bucketed by month had its surviving groups recomputed
    // per raw day. A month whose total clears the filter can contain no single day that does, so
    // Totals silently read 0 while the report showed the month.
    it('regroups by the report bucket, not the raw column, when the dimension is bucketed', () => {
      const { sql } = render(d, {
        dimensions: ['order_date'],
        having: [HAVING_RULE],
        dateTruncs: [{ column: 'order_date', unit: 'MONTH' }],
      });

      const truncated = d.renderer().renderDateTruncExpression(d.ref('order_date'), 'MONTH');
      expect(sql).toContain(`GROUP BY\n  ${truncated}`);
      expect(sql).toContain(`${truncated} AS `);
      // The outer side of the join must be the SAME bucket expression — matching a raw date
      // against a month key keeps no rows at all.
      expect(sql).toContain(`ON ((${truncated}) = `);
    });

    // The defect: a report with only metrics (`revenue`, filtered by SUM(revenue) > 1000 — the
    // shape query_data_mart emits for "total revenue, only if above 1000") has no dimensions, so
    // the projection came out empty and the emitted SQL was a bare `SELECT` — a syntax error.
    it('projects a constant and cross-joins when the report has no dimensions', () => {
      const { sql } = render(d, { dimensions: [], having: [HAVING_RULE] });

      expect(sql).toContain('CROSS JOIN (');
      expect(sql).toMatch(/SELECT\n {2}1 AS /);
      expect(sql).not.toMatch(/SELECT\s*\n\s*FROM/);
      expect(sql).toContain('HAVING');
      // One grand-total group: nothing to group BY, the HAVING alone keeps or drops it.
      expect(sql).not.toContain('GROUP BY');
    });

    it('carries the WHERE filters into the subquery so the same rows form the groups', () => {
      const { sql, params } = render(
        d,
        { dimensions: ['channel'], having: [HAVING_RULE] },
        { filters: [{ column: 'channel', operator: 'eq', value: 'paid' } as FilterRule] }
      );

      expect(sql).toContain('WHERE');
      expect(sql.indexOf('WHERE')).toBeLessThan(sql.indexOf('GROUP BY'));
      // Inline-literal dialects bind nothing; the two that bind must emit WHERE params before
      // HAVING params, in the order the placeholders appear.
      if (params.length > 0) {
        expect(params.map(p => p.value)).toEqual(['paid', 1000]);
      } else {
        expect(sql).toContain("'paid'");
      }
    });

    // The defect: a ROW-LEVEL calculated field is a real grouping key of the report, but
    // calculated names were stripped from the restriction outright — so the kept-groups CTE
    // regrouped at a COARSER grain than the report, and the metric filter then kept a different
    // row set than the report shows.
    it('regroups by a row-level calculated expression, after every column key', () => {
      const { sql } = render(d, {
        dimensions: ['channel', 'session_key'],
        having: [HAVING_RULE],
        calculatedDimensions: [SESSION_KEY_PLAN],
      });

      const expr = `CONCAT(${d.ref('session_id')}, ${d.ref('user_id')})`;
      expect(sql).toContain(`GROUP BY\n  ${d.ref('channel')},\n  ${expr}`);
      expect(sql).toContain(`${expr} AS `);
      expect(sql).toContain('_owox_kg_1');
      // Its NAME is a SELECT alias of the report, never a warehouse column — a bare reference to
      // it is the `Unrecognized name` the old strip existed to prevent.
      expect(sql).not.toContain('session_key');
      // The outer side of the join must be the SAME expression, or no row matches.
      expect(sql).toContain(`ON ((${d.ref('channel')}) = `);
      expect(sql).toContain(`AND ((${expr}) = `);
    });

    // The two shapes above combine. A report grouped by a BUCKETED calculated
    // dimension regroups the restriction at that same bucket — regrouping at the raw formula value
    // is the identical defect the date-bucket case above records, one grain finer, and it reads as
    // a silent 0 in Totals rather than as an error.
    it('regroups by the bucket of a calculated dimension, not its raw value', () => {
      const { sql } = render(d, {
        dimensions: ['visit_day'],
        having: [HAVING_RULE],
        dateTruncs: [{ column: 'visit_day', unit: 'MONTH' }],
        calculatedDimensions: [VISIT_DAY_PLAN],
      });

      const expr = `DATE(${d.ref('visit_ts')})`;
      const truncated = d
        .renderer()
        .renderDateTruncExpression(expr, 'MONTH', undefined, VISIT_DAY_PLAN.type);
      expect(sql).toContain(`GROUP BY\n  ${truncated}`);
      expect(sql).toContain(`${truncated} AS `);
      expect(sql).toContain(`ON ((${truncated}) = `);
    });

    // A row-level field with no column dimension beside it still restricts by its own groups —
    // NOT the dimensionless CROSS JOIN, which would keep every row the HAVING's grand total keeps.
    it('joins on the row-level key alone when it is the only dimension', () => {
      const { sql } = render(d, {
        dimensions: ['session_key'],
        having: [HAVING_RULE],
        calculatedDimensions: [SESSION_KEY_PLAN],
      });

      const expr = `CONCAT(${d.ref('session_id')}, ${d.ref('user_id')})`;
      expect(sql).not.toContain('CROSS JOIN');
      expect(sql).toContain(`${expr} AS `);
      expect(sql).toContain(`ON ((${expr}) = `);
    });

    // Float dimensions: GROUP BY buckets all NaNs together, but `NaN = NaN` is FALSE on BigQuery
    // and Trino — without the extra leg those rows match no kept group and drop out of Totals.
    it('adds the NaN-safe leg for a floating-point dimension only', () => {
      const floatJoin = render(
        d,
        { dimensions: ['score'], having: [HAVING_RULE] },
        { typeByColumn: new Map([['score', 'FLOAT64']]) }
      ).sql;
      const stringJoin = render(
        d,
        { dimensions: ['channel'], having: [HAVING_RULE] },
        { typeByColumn: new Map([['channel', 'STRING']]) }
      ).sql;

      expect(floatJoin).toContain('!=');
      expect(stringJoin).not.toContain('!=');
    });
  });

  // Positional binding (Athena `?`) has no names to fall back on: the params array must match the
  // textual order of the placeholders, and this fragment renders WHERE before HAVING.
  it('Athena emits placeholders in the order it binds them', () => {
    const { sql, params } = render(DIALECTS.find(d => d.name === 'Athena')!, {
      dimensions: ['channel'],
      having: [HAVING_RULE],
    });

    expect((sql.match(/\?/g) ?? []).length).toBe(params.length);
  });

  /**
   * Every flat builder must honour a restriction — the one thing a new storage cannot be allowed
   * to forget. It was five hand-written copies of the same sequence, and they had already drifted
   * (one passed a column qualifier, three did not; one passed neither field types nor a type
   * resolver). They now share `renderAggregatedQuery`, and this asserts it from the OUTSIDE: a
   * sixth builder that hand-rolls its own aggregated branch and omits the restriction compiles
   * cleanly, and would silently compute Totals over the groups its report hides.
   */
  describe('every flat query builder applies it', () => {
    const RESTRICTED: DataMartQueryOptions = {
      columns: ['revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      groupRestriction: { dimensions: ['channel'], having: [HAVING_RULE] },
    };

    const BUILDERS: { name: string; build: () => Promise<string> }[] = [
      {
        name: 'BigQuery',
        build: async () => {
          const built = await new BigQueryQueryBuilder(new BigQueryClauseRenderer()).buildQuery(
            { fullyQualifiedName: 'p.d.t' } as never,
            RESTRICTED
          );
          return typeof built === 'string' ? built : built.sql;
        },
      },
      {
        name: 'Athena',
        build: async () =>
          asSql(
            new AthenaQueryBuilder(new AthenaClauseRenderer()).buildQuery(
              { fullyQualifiedName: 'db.tbl' } as never,
              RESTRICTED
            )
          ),
      },
      {
        name: 'Snowflake',
        build: async () =>
          asSql(
            new SnowflakeQueryBuilder(new SnowflakeClauseRenderer()).buildQuery(
              { fullyQualifiedName: 'DB.SC.TBL' } as never,
              RESTRICTED
            )
          ),
      },
      {
        name: 'Redshift',
        build: async () =>
          asSql(
            new RedshiftQueryBuilder(new RedshiftClauseRenderer()).buildQuery(
              { fullyQualifiedName: 'sc.tbl' } as never,
              RESTRICTED
            )
          ),
      },
      {
        name: 'Databricks',
        build: async () =>
          asSql(
            new DatabricksQueryBuilder(new DatabricksClauseRenderer()).buildQuery(
              { fullyQualifiedName: 'cat.sc.tbl' } as never,
              RESTRICTED
            )
          ),
      },
    ];

    it.each(BUILDERS)(
      '$name joins the kept groups and keeps its own columns unambiguous',
      async b => {
        const sql = await b.build();

        expect(sql).toContain('_kept_groups');
        expect(sql).toContain('_owox_kg_0');
        expect(sql).toContain('HAVING');
        // The projection must not re-expose the dimension's own name into the outer scope.
        expect(sql).not.toMatch(/AS\s+["`]?channel["`]?\s*\n/);
      }
    );
  });

  /**
   * The positional 1:1 with a FILTERED subsequence.
   *
   * `renderAggregatedSelect` emits a grouping key for a ROW-LEVEL plan and none at all for an
   * aggregate-level one, so the calculated keys are a subsequence of `calculatedDimensions` — not
   * that array. Pairing `dimensions[i]` against the unfiltered list shifts every later key onto
   * the wrong dimension, which is a silently wrong Totals number rather than an error.
   */
  describe('the positional pairing survives a mixed-level plan list', () => {
    const bq = () => new BigQueryClauseRenderer();
    const CTR_PLAN: CalculatedFieldPlan = {
      outputName: 'ctr',
      type: 'FLOAT',
      level: 'metric',
      formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
    };
    const EXPR = 'CONCAT(src.`session_id`, src.`user_id`)';

    const renderMixed = (typeByColumn?: ReadonlyMap<string, string>) =>
      bq().renderKeptGroupsJoin({
        restriction: {
          dimensions: ['channel', 'session_key'],
          having: [HAVING_RULE],
          calculatedDimensions: [CTR_PLAN, SESSION_KEY_PLAN],
        },
        fromClause: '`p.d.t` AS src',
        filters: [],
        qualifyColumn: c => `src.\`${c}\``,
        typeByColumn,
        resolveColumnType: undefined,
      });

    it('binds each key to its own dimension, and the aggregate-level plan contributes none', () => {
      const { sql } = renderMixed();

      expect(sql).toContain('src.`channel` AS `_owox_kg_0`');
      expect(sql).toContain(`${EXPR} AS \`_owox_kg_1\``);
      expect(sql).toContain('ON ((src.`channel`) = (`_kept_groups`.`_owox_kg_0`)');
      expect(sql).toContain(`AND ((${EXPR}) = (\`_kept_groups\`.\`_owox_kg_1\`)`);
      // An aggregate is not a grouping key, and the HAVING renders its own — the restriction
      // subquery must not project it either.
      expect(sql).not.toContain('`ctr`');
      expect(sql).toContain('_owox_kg_1');
      expect(sql).not.toContain('_owox_kg_2');
    });

    // The NaN-safe leg reads the type by the dimension NAME, and `columnTypes` carries a declared
    // type for a calculated field (`isConnected` is true for one) — so a row-level formula the
    // analyst declared FLOAT gets the same leg a float column does.
    it('takes the NaN-safe leg from the calculated field own declared type', () => {
      const floatKey = renderMixed(new Map([['session_key', 'FLOAT64']])).sql;
      const stringKey = renderMixed(new Map([['session_key', 'STRING']])).sql;

      expect(floatKey).toContain(`(${EXPR}) != (${EXPR})`);
      expect(stringKey).not.toContain('!=');
    });
  });

  // A restriction dimension that is ALSO an aggregated metric would stop being a GROUP BY key,
  // shifting every later key onto the wrong dimension — projected keys and join pairs are
  // positional. Both callers avoid that by passing no aggregation rules; this is the backstop
  // for the day one of them stops.
  it('refuses a restriction whose dimensions do not all become grouping keys', () => {
    expect(() =>
      buildKeptGroupsProjection(['src.`channel`'], ['channel', 'country'], n => `\`${n}\``)
    ).toThrow(/every restriction dimension must be a GROUP BY key/);
    expect(() =>
      buildKeptGroupsJoinPairs(
        ['src.`channel`'],
        ['channel', 'country'],
        '`_kept_groups`',
        n => `\`${n}\``,
        () => false
      )
    ).toThrow(/every restriction dimension must be a GROUP BY key/);
  });
});
