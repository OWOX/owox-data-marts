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
import { SqlClauseRenderer } from './sql-clause-renderer';
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
      expect(sql).toContain(`ON (${truncated} = `);
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
