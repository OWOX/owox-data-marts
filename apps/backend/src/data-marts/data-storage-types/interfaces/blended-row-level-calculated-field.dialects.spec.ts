/**
 * A ROW-LEVEL calculated field on a JOINED report, through the REAL builder of every storage.
 *
 * Everything the slice added so far was asserted against one test double that quotes like
 * BigQuery — and the two shapes it adds here are precisely where a dialect's own spelling reaches
 * the SQL. The expression's column references are qualified by the BUILDER (Snowflake quotes every
 * identifier; the other four leave a safe one bare), while the output alias beside it is quoted by
 * the CLAUSE RENDERER (backticks on BigQuery and Databricks, double quotes on the rest). Two
 * different quoting sources in one SELECT item, and a report on the wrong side of either fails in
 * the warehouse rather than in a test.
 *
 * This is NOT a live-warehouse proof: nothing here executes SQL. It fixes the SHAPE per dialect; the live
 * five-storage pass still owes the numbers.
 */
import { AthenaBlendedQueryBuilder } from '../athena/services/athena-blended-query-builder';
import { AthenaClauseRenderer } from '../athena/services/athena-clause-renderer';
import { BigQueryBlendedQueryBuilder } from '../bigquery/services/bigquery-blended-query-builder';
import { BigQueryClauseRenderer } from '../bigquery/services/bigquery-clause-renderer';
import { DatabricksBlendedQueryBuilder } from '../databricks/services/databricks-blended-query-builder';
import { DatabricksClauseRenderer } from '../databricks/services/databricks-clause-renderer';
import { RedshiftBlendedQueryBuilder } from '../redshift/services/redshift-blended-query-builder';
import { RedshiftClauseRenderer } from '../redshift/services/redshift-clause-renderer';
import { SnowflakeBlendedQueryBuilder } from '../snowflake/services/snowflake-blended-query-builder';
import { SnowflakeClauseRenderer } from '../snowflake/services/snowflake-clause-renderer';
import { AbstractBlendedQueryBuilder } from './abstract-blended-query-builder';
import { ResolvedRelationshipChain } from './blended-query-builder.interface';
import { CalculatedFieldPlan } from '../utils/sql-clause-renderer';
import { buildBlendedFieldIndex } from '../../services/blended-field-index';
import { buildFormulaOwnerPlan } from '../../calculated-fields/formula-owner-plan';
import { createFormulaFunctionDialectRegistry } from '../../calculated-fields/formula-function-dialect';
import {
  createBuildContext,
  makeChain,
  makeRelationship,
} from './__fixtures__/blended-query-builder-fixtures';
import type { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import type { FilterRule } from '../../dto/schemas/filter-config.schema';

/** Arithmetic, not a named function: what is under test is the qualifier, not the SQL vocabulary. */
const MARGIN_FORMULA = '({{ref field="revenue"}} - {{ref field="cost"}})';
const marginPlan = (): CalculatedFieldPlan => ({
  outputName: 'margin',
  type: 'FLOAT',
  formula: MARGIN_FORMULA,
  level: 'column',
});

/** DATE-declared, because the report may bucket exactly that. */
const VISIT_DAY_FORMULA = 'COALESCE({{ref field="visit_ts"}}, {{ref field="created_ts"}})';
const visitDayPlan = (): CalculatedFieldPlan => ({
  outputName: 'visit_day',
  type: 'DATE',
  formula: VISIT_DAY_FORMULA,
  level: 'column',
});

const DIALECTS: {
  name: string;
  builder: () => AbstractBlendedQueryBuilder;
  /** How this builder qualifies a main-native column. */
  ref: (column: string) => string;
  /** How this dialect's clause renderer quotes an OUTPUT alias — always quoted. */
  alias: (name: string) => string;
  /** How the BUILDER quotes an internal alias (`_owox_dim_i`, `_owox_kg_i`) — bare when safe. */
  id: (name: string) => string;
  /** A float type this dialect DECLARES, and the SQL name its renderer casts that to. */
  declaredFloat: string;
  floatCast: string;
  /** An integer type it declares — mapped by the renderer, and never cast on purpose. */
  declaredInteger: string;
  /** This dialect's own spelling of a MONTH bucket over a DATE-declared expression. */
  monthBucket: (expression: string) => string;
}[] = [
  {
    name: 'BigQuery',
    builder: () => new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer()),
    ref: c => `main.${c}`,
    alias: n => `\`${n}\``,
    id: n => n,
    declaredFloat: 'FLOAT',
    floatCast: 'FLOAT64',
    declaredInteger: 'INTEGER',
    // The one type-aware dialect: a DATE declaration is left bare, anything else is wrapped in
    // `DATE(...)`. So a sleeve reading the type from anywhere but the plan shows up here.
    monthBucket: e => `DATE_TRUNC(${e}, MONTH)`,
  },
  {
    name: 'Athena',
    builder: () => new AthenaBlendedQueryBuilder(new AthenaClauseRenderer()),
    ref: c => `main.${c}`,
    alias: n => `"${n}"`,
    id: n => n,
    declaredFloat: 'DOUBLE',
    floatCast: 'DOUBLE',
    declaredInteger: 'BIGINT',
    monthBucket: e => `date_trunc('month', ${e})`,
  },
  {
    name: 'Snowflake',
    builder: () => new SnowflakeBlendedQueryBuilder(new SnowflakeClauseRenderer()),
    ref: c => `"main"."${c}"`,
    alias: n => `"${n}"`,
    id: n => `"${n}"`,
    declaredFloat: 'FLOAT',
    floatCast: 'FLOAT',
    declaredInteger: 'INTEGER',
    monthBucket: e => `DATE_TRUNC('MONTH', ${e})`,
  },
  {
    name: 'Redshift',
    builder: () => new RedshiftBlendedQueryBuilder(new RedshiftClauseRenderer()),
    ref: c => `main.${c}`,
    alias: n => `"${n}"`,
    id: n => n,
    declaredFloat: 'DOUBLE PRECISION',
    floatCast: 'DOUBLE PRECISION',
    declaredInteger: 'INTEGER',
    monthBucket: e => `DATE_TRUNC('month', ${e})`,
  },
  {
    name: 'Databricks',
    builder: () => new DatabricksBlendedQueryBuilder(new DatabricksClauseRenderer()),
    ref: c => `main.${c}`,
    alias: n => `\`${n}\``,
    id: n => n,
    declaredFloat: 'DOUBLE',
    floatCast: 'DOUBLE',
    declaredInteger: 'INT',
    monthBucket: e => `DATE_TRUNC('MONTH', ${e})`,
  },
];

/** On a MAIN-native metric: a HAVING on the sleeve-routed joined one is refused outright. */
const HAVING_RULE = {
  column: 'clicks',
  function: 'SUM',
  operator: 'gt',
  value: 10,
  placement: 'post-join',
} as unknown as FilterRule;

const buildContext = createBuildContext('main_table');

const spendChain = (): ResolvedRelationshipChain =>
  makeChain({
    relationship: makeRelationship({
      targetAlias: 'spend',
      joinConditions: [{ sourceFieldName: 'date', targetFieldName: 'date' }],
    }),
    targetTableReference: 'spend_table',
    parentAlias: 'main',
    blendedFields: [
      {
        targetFieldName: 'cost',
        outputAlias: 'spend__cost',
        isHidden: false,
        aggregateFunction: 'SUM',
      },
    ],
  });

const spendFieldIndex = buildBlendedFieldIndex({
  blendedFields: [
    { name: 'spend__cost', aliasPath: 'spend', originalFieldName: 'cost', type: 'FLOAT' },
  ],
  availableSources: [{ aliasPath: 'spend', isIncluded: true }],
} as never);

/** A SECOND joined source, so a report can carry two sleeves that must both hold the same grain. */
const ordersChain = (): ResolvedRelationshipChain =>
  makeChain({
    relationship: makeRelationship({
      id: 'rel-orders',
      targetAlias: 'orders',
      joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
    }),
    targetTableReference: 'orders_table',
    parentAlias: 'main',
    blendedFields: [
      {
        targetFieldName: 'amount',
        outputAlias: 'orders__amount',
        isHidden: false,
        aggregateFunction: 'SUM',
      },
    ],
  });

const twoSourceFieldIndex = buildBlendedFieldIndex({
  blendedFields: [
    { name: 'spend__cost', aliasPath: 'spend', originalFieldName: 'cost', type: 'FLOAT' },
    { name: 'orders__amount', aliasPath: 'orders', originalFieldName: 'amount', type: 'FLOAT' },
  ],
  availableSources: [
    { aliasPath: 'spend', isIncluded: true },
    { aliasPath: 'orders', isIncluded: true },
  ],
} as never);

/** A joined aggregate call inside a metric's formula — the shape that produces a FORMULA sleeve. */
const ROI_FORMULA = 'SUM({{ref path="spend" field="cost"}}) * 2';
const formulaDialects = createFormulaFunctionDialectRegistry();

async function roiPlan(builder: AbstractBlendedQueryBuilder): Promise<CalculatedFieldPlan> {
  // The storage's REAL aggregate vocabulary decides whether the call is lifted at all.
  const dialect = await formulaDialects.resolve(builder.type);
  return {
    outputName: 'roi',
    type: 'FLOAT',
    formula: ROI_FORMULA,
    level: 'metric',
    formulaOwnership: buildFormulaOwnerPlan(ROI_FORMULA, n => dialect.isAggregateFunction(n)),
  };
}

describe('a row-level calculated field on a joined report — every dialect', () => {
  describe.each(DIALECTS)('$name', d => {
    const expression = `(${d.ref('revenue')} - ${d.ref('cost')})`;
    /** One CTE's body — Snowflake quotes every CTE name, the rest leave a safe one bare. */
    const cteBody = (sql: string, name: string): string => {
      const start = sql.indexOf(`${d.id(name)} AS (`);
      expect(start).toBeGreaterThanOrEqual(0);
      return sql.slice(start, sql.indexOf('\n  )', start));
    };
    const mainCteBody = (sql: string): string => cteBody(sql, 'main');
    /** The sleeve's join-back key, which is byte-identity between the two derivations or nothing. */
    const joinsBackOn = (cteName: string): string =>
      `(${expression}) = (${d.id(cteName)}.${d.id('_owox_dim_1')})`;

    // Spec §4: with no aggregation rules the query keeps its PLAIN shape, and that projection had
    // no calculated channel at all — the field was absent from the SQL while a header was still
    // published. Blank column here, an exception on Athena and Redshift.
    it('projects the expression on the ungrouped path, with no grouping of its own', () => {
      const { sql } = d.builder().buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        calculatedFields: [marginPlan()],
      });
      const outer = sql.slice(sql.lastIndexOf('\n\nSELECT\n'));

      expect(outer).toContain(`${expression} AS ${d.alias('margin')}`);
      expect(outer).not.toContain('GROUP BY');
      // Its NAME is a SELECT alias: no CTE may project it, while the columns it reads must be
      // there or the outer SELECT reads what the CTE never carried.
      const mainCte = mainCteBody(sql);
      expect(mainCte).toContain('revenue');
      expect(mainCte).toContain('cost');
      expect(mainCte).not.toContain('margin');
    });

    // The declared type is imposed on a COMPARISON, and a sort is a comparison. Ordering by the
    // bare alias sorted a float-declared formula's TEXT: measured `9, 100` where `100, 10` is
    // correct, identically on BigQuery, Athena, Redshift and Databricks — under a LIMIT that is a
    // different ROW SET, not a different order.
    //
    // The alias cannot simply be wrapped: `ORDER BY CAST(<alias> AS …)` fails on Redshift, where an
    // output name is visible only as a bare ORDER BY term and never inside an expression
    // (measured). So the expression is repeated — built from the SAME map the filter's left-hand
    // side comes from, so a field that is both filtered and sorted carries one string in both
    // clauses rather than two that merely ought to agree.
    it('sorts by the field cast expression rather than qualifying its name against main', () => {
      const { sql } = d.builder().buildBlendedQuery({
        ...buildContext([spendChain()], ['channel']),
        fieldIndex: spendFieldIndex,
        // The dialect's OWN float spelling: `marginPlan`'s literal 'FLOAT' is not a Redshift
        // declared type at all, so that dialect emitted no cast and this test passed there for
        // the wrong reason.
        calculatedFields: [{ ...marginPlan(), type: d.declaredFloat }],
        sort: [{ column: 'margin', direction: 'desc' }],
      });

      expect(sql).toContain(`ORDER BY\n  CAST((${expression}) AS ${d.floatCast}) DESC`);
      expect(sql).not.toContain(`${d.ref('margin')} DESC`);
      expect(sql).not.toContain(`ORDER BY\n  ${d.alias('margin')} DESC`);
    });

    // The grouped counterpart: the field is a dimension, so the outer query groups by the SAME
    // expression it projects, and every sleeve must carry that key byte for byte.
    it('groups the aggregated path by the expression and gives the sleeve the identical key', () => {
      const { sql } = d.builder().buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        calculatedFields: [marginPlan()],
        aggregations: [{ column: 'spend__cost', function: 'SUM' }] as AggregationRule[],
      });

      expect(sql).toContain(`${expression} AS ${d.alias('margin')}`);
      expect(sql.slice(sql.lastIndexOf('GROUP BY'))).toContain(expression);
      expect(sql).toContain(`${expression} AS ${d.id('_owox_dim_1')}`);
      // The join-back reads that key: a sleeve rendering it differently matches no row at all.
      expect(sql).toContain(`(${expression}) = (`);
    });

    // The report buckets the field, so the outer GROUP BY key is the
    // TRUNCATED expression and every sleeve must reproduce both steps in the same order. Each
    // dialect spells the truncation its own way, and the join-back is byte-identity or nothing —
    // an untruncated sleeve key matches no row, which a COUNT_DISTINCT pull reads as a plain 0.
    it('buckets the calculated dimension and gives the sleeve the identical truncated key', () => {
      const visitExpression = `COALESCE(${d.ref('visit_ts')}, ${d.ref('created_ts')})`;
      const bucket = d.monthBucket(visitExpression);
      const { sql } = d.builder().buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        calculatedFields: [visitDayPlan()],
        aggregations: [{ column: 'spend__cost', function: 'SUM' }] as AggregationRule[],
        dateTruncs: [{ column: 'visit_day', unit: 'MONTH' }],
      });

      expect(sql).toContain(`${bucket} AS ${d.alias('visit_day')}`);
      expect(sql.slice(sql.lastIndexOf('GROUP BY'))).toContain(bucket);
      expect(cteBody(sql, 'sleeve_spend__cost')).toContain(`${bucket} AS ${d.id('_owox_dim_1')}`);
      expect(sql).toContain(`(${bucket}) = (${d.id('sleeve_spend__cost')}.${d.id('_owox_dim_1')})`);
      // The raw expression is not a key of its own anywhere: `... AS _owox_dim_1` on the untruncated
      // formula is precisely the drift, and it is what the builder's membership assertion refuses.
      expect(sql).not.toContain(`${visitExpression} AS ${d.id('_owox_dim_1')}`);
      // Per dialect: the cast the design rejected returns the wrong MONTH on Redshift where
      // the uncast shape errors, so no dialect may acquire one on this path. What this pins is a
      // HAND-WRITTEN cast, and only that. The fixture declares DATE and all five real
      // `castTypeForDeclaredType` maps are numeric-only, so a cast resolved through that seat —
      // the realistic "harmonise with the SUM path" mutation — renders nothing here and leaves
      // this green. That mutation is a production no-op for the same reason (only a date-declared
      // field can carry a bucket, and no map states a target for one); the assertions that DO
      // catch it are the flat ones over a FLOAT declaration — `sql-clause-renderer.spec.ts`'s
      // `adds no CAST … declared FLOAT` and BigQuery's `adds no CAST, whatever the declared type`.
      expect(sql).not.toContain('CAST(');
    });

    // A formula that reads ANOTHER formula. The outer SELECT emits the SUBSTITUTED text, so the
    // columns this query actually reads are the DEPENDENCY's — and the dependency's own name is a
    // SELECT alias no warehouse column may own. Both halves are derived from the main CTE's
    // projection, which is where either mistake surfaces: `Unrecognized name`, on every dialect.
    it('projects a dependency’s columns, and not its name, into the main CTE', () => {
      const grossMargin: CalculatedFieldPlan = {
        outputName: 'gross_margin',
        type: 'FLOAT',
        formula: MARGIN_FORMULA,
        level: 'column',
      };
      const { sql } = d.builder().buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        calculatedFields: [
          {
            outputName: 'margin_rate',
            type: 'FLOAT',
            formula: '{{ref field="gross_margin"}} / {{ref field="units"}}',
            level: 'column',
            dependencies: [grossMargin],
          },
        ],
        aggregations: [{ column: 'spend__cost', function: 'SUM' }] as AggregationRule[],
      });

      const substituted = `(${expression}) / ${d.ref('units')}`;
      expect(sql).toContain(`${substituted} AS ${d.alias('margin_rate')}`);
      const mainCte = mainCteBody(sql);
      expect(mainCte).toContain('revenue');
      expect(mainCte).toContain('cost');
      expect(mainCte).toContain('units');
      expect(mainCte).not.toContain('gross_margin');
      expect(mainCte).not.toContain('margin_rate');
      // The sleeve keys on the SAME substituted string, so the join-back can still only match.
      expect(sql).toContain(`${substituted} AS ${d.id('_owox_dim_1')}`);
    });

    // A FORMULA sleeve (a joined aggregate call lifted out of a metric's formula) beside a
    // row-level dimension. The one composition where the SHARED render options object is MUTATED
    // between the sleeve's read and the outer query's: `formulaReplacements` is empty when the
    // sleeves render and filled before `renderAggregatedSelect` reads the same object. Byte-identity
    // survives only because a row-level plan can never key that map — pinned here rather than argued.
    it('gives a formula sleeve the identical row-level key, across the shared-options mutation', async () => {
      const builder = d.builder();
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['channel']),
        fieldIndex: spendFieldIndex,
        calculatedFields: [marginPlan(), await roiPlan(builder)],
      });

      // The joined call really was lifted, or the composition under test never happened.
      expect(sql).toContain(`${d.id('sleeve_fx_roi_0')} AS (`);
      expect(cteBody(sql, 'sleeve_fx_roi_0')).toContain(`${expression} AS ${d.id('_owox_dim_1')}`);
      expect(sql.slice(sql.lastIndexOf('GROUP BY'))).toContain(expression);
      expect(sql).toContain(joinsBackOn('sleeve_fx_roi_0'));
      // The metric is an aggregate spliced from the sleeve's pull; only the row-level field groups.
      expect(sql).toContain(`AS ${d.alias('roi')}`);
    });

    // Two sleeves, one row-level dimension: each sleeve derives the key independently, so a drift
    // that reached only one of them would still leave the report looking half-right.
    it('gives every sleeve the identical row-level key when the report carries two', () => {
      const { sql } = d.builder().buildBlendedQuery({
        ...buildContext(
          [spendChain(), ordersChain()],
          ['channel', 'spend__cost', 'orders__amount']
        ),
        fieldIndex: twoSourceFieldIndex,
        calculatedFields: [marginPlan()],
        aggregations: [
          { column: 'spend__cost', function: 'SUM' },
          { column: 'orders__amount', function: 'SUM' },
        ] as AggregationRule[],
      });

      for (const cte of ['sleeve_spend__cost', 'sleeve_orders__amount']) {
        expect(cteBody(sql, cte)).toContain(`${expression} AS ${d.id('_owox_dim_1')}`);
        expect(sql).toContain(joinsBackOn(cte));
      }
      expect(sql.slice(sql.lastIndexOf('GROUP BY'))).toContain(expression);
    });

    // The AGGREGATED counterpart of the plain-path sort above. Here the field's name is a GROUP BY
    // key as well as a SELECT alias, so qualifying it against `main` is still an unrecognized name.
    // The cast expression is a function of that grouping key, which is legal wherever the key is —
    // and the sleeve's join-back grain is asserted below precisely because ORDER BY must not have
    // moved it.
    it('sorts the aggregated path by the field cast expression, never by main-qualified name', () => {
      const { sql } = d.builder().buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        calculatedFields: [{ ...marginPlan(), type: d.declaredFloat }],
        aggregations: [{ column: 'spend__cost', function: 'SUM' }] as AggregationRule[],
        sort: [{ column: 'margin', direction: 'desc' }],
      });

      expect(sql).toContain(`ORDER BY\n  CAST((${expression}) AS ${d.floatCast}) DESC`);
      expect(sql).not.toContain(d.ref('margin'));
      expect(sql).not.toContain(`ORDER BY\n  ${d.alias('margin')} DESC`);
      // Sorting must not have disturbed the grain the sleeve joins back on.
      expect(sql).toContain(joinsBackOn('sleeve_spend__cost'));
    });

    // Totals restricted by a metric filter must reproduce the report's OWN grain, the
    // row-level expression included — a restriction one key coarser keeps a different row set
    // than the report shows, which is a wrong number rather than an error.
    it('regroups the kept-groups CTE by the expression, after every column key', () => {
      const { sql } = d.builder().buildBlendedQuery({
        ...buildContext([spendChain()], ['spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'spend__cost', function: 'SUM' }] as AggregationRule[],
        groupRestriction: {
          dimensions: ['channel', 'margin'],
          calculatedDimensions: [marginPlan()],
          having: [HAVING_RULE],
        },
      });
      const cte = sql.slice(
        sql.indexOf(`${d.id('_kept_groups')} AS (`),
        sql.lastIndexOf('\n\nSELECT\n')
      );

      expect(cte).toContain(`${expression} AS ${d.id('_owox_kg_1')}`);
      expect(cte.replace(/\s+/g, ' ')).toContain(`GROUP BY ${d.ref('channel')}, ${expression}`);
      // The join's left-hand side is the same expression, evaluated in the outer query's scope.
      expect(sql).toContain(`AND ((${expression}) = (`);
      // The field's NAME reaches no CTE projection: `SELECT margin FROM <main table>` is the
      // `Unrecognized name` this channel exists to prevent.
      const mainCte = mainCteBody(sql);
      expect(mainCte).toContain('revenue');
      expect(mainCte).not.toContain('margin');
    });

    // The other shape of restriction HAVING, and the one no level covered: the report AGGREGATES
    // the row-level field and filters on that aggregation. The field is then no grouping key, so
    // it never travels as a restriction dimension — and re-derived here the left-hand side was the
    // field's NAME, `SUM(main.margin)` over CTEs that carry no such column. The report itself
    // stayed correct and the Totals row silently disappeared, because both Totals callers swallow
    // the warehouse error.
    //
    // Asserted as the RELATIONSHIP between the two queries: one `aggregateArgument` on both sides,
    // so a mutation to the cast rule fails the projection and the restriction together, and a
    // restriction that derives its own spelling fails alone.
    it('compares the same aggregate argument in the kept-groups CTE as in the report', () => {
      const aggregated: CalculatedFieldPlan = {
        ...marginPlan(),
        type: d.declaredFloat,
        isAggregatedByReport: true,
      };
      const metricFilter = {
        column: 'margin',
        function: 'SUM',
        operator: 'gt',
        value: 10,
        placement: 'post-join',
      } as unknown as FilterRule;
      const aggregateArgument = `CAST((${expression}) AS ${d.floatCast})`;

      const report = d.builder().buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        calculatedFields: [aggregated],
        calculatedFilterMetrics: [aggregated],
        aggregations: [
          { column: 'spend__cost', function: 'SUM' },
          { column: 'margin', function: 'SUM' },
        ] as AggregationRule[],
        filters: [metricFilter],
      });
      // A calculated field stays out of the Totals plan's own metrics, so this query renders
      // the aggregate nowhere but inside the restriction.
      const totals = d.builder().buildBlendedQuery({
        ...buildContext([spendChain()], ['spend__cost']),
        fieldIndex: spendFieldIndex,
        calculatedFilterMetrics: [aggregated],
        aggregations: [{ column: 'spend__cost', function: 'SUM' }] as AggregationRule[],
        groupRestriction: {
          dimensions: ['channel'],
          having: [metricFilter],
          calculatedHavingMetrics: [aggregated],
        },
      });

      expect(report.sql).toContain(`SUM(${aggregateArgument}) AS ${d.alias('margin | SUM')}`);
      expect(cteBody(totals.sql, '_kept_groups')).toContain(`HAVING SUM(${aggregateArgument})`);
      // The name resolves to nothing in either scope, so it may not appear in any spelling.
      expect(totals.sql).not.toContain(d.ref('margin'));
    });

    // The report FILTERS on the field. The predicate has to reach the outer
    // query AND the inside of every sleeve — #6766's Critical C1 was a sleeve reading `FROM main`
    // unfiltered, which computes the joined metric over ALL rows and gives Totals an unfiltered
    // grand total, silently. Per dialect because the left-hand side is the formula qualified by
    // the BUILDER while the placeholder beside it comes from the CLAUSE RENDERER.
    //
    // The left-hand side carries the DECLARED type — declared per dialect here so all
    // five impose one, and the sleeve's copy has to impose the same one or the two clauses select
    // different rows for the same report.
    it('reproduces a row-level calculated predicate inside the sleeve', () => {
      const filtered = { ...marginPlan(), type: d.declaredFloat };
      const { sql } = d.builder().buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        calculatedFields: [filtered],
        calculatedFilterMetrics: [filtered],
        aggregations: [{ column: 'spend__cost', function: 'SUM' }] as AggregationRule[],
        filters: [{ column: 'margin', operator: 'gt', value: 1, clause: 'where' }],
      });
      // Trailing `CAST(` on purpose: the VALUE carries the declaration too, and the sleeve is
      // where losing it is silent — an unfiltered joined metric, #6766's Critical C1 all over.
      const predicate = `WHERE CAST((${expression}) AS ${d.floatCast}) > CAST(`;

      expect(cteBody(sql, 'sleeve_spend__cost')).toContain(predicate);
      // The outer query compares the same expression, and neither side names the field as a column.
      expect(sql.slice(sql.lastIndexOf('\n\nSELECT\n'))).toContain(predicate);
      expect(sql).not.toContain(d.ref('margin'));
    });

    // Filtered but NOT selected: the field has no plan at the sleeve and nothing else references
    // the columns its formula reads, so both the predicate and the projection behind it have to
    // arrive through the filter channel alone.
    it('reproduces the predicate inside the sleeve when the field is not selected', () => {
      const { sql } = d.builder().buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        calculatedFilterMetrics: [{ ...marginPlan(), type: d.declaredFloat }],
        aggregations: [{ column: 'spend__cost', function: 'SUM' }] as AggregationRule[],
        filters: [{ column: 'margin', operator: 'gt', value: 1, clause: 'where' }],
      });

      expect(cteBody(sql, 'sleeve_spend__cost')).toContain(
        `WHERE CAST((${expression}) AS ${d.floatCast}) > CAST(`
      );
      const mainCte = mainCteBody(sql);
      expect(mainCte).toContain('revenue');
      expect(mainCte).toContain('cost');
      expect(mainCte).not.toContain('margin');
      // Not a grouping key: it is not selected, so no sleeve may acquire a second key for it.
      expect(cteBody(sql, 'sleeve_spend__cost')).not.toContain(d.id('_owox_dim_1'));
    });

    // The report may aggregate the field, and it then leaves the OUTER grouping keys and
    // the SLEEVE's grain together. Out of step, the sleeve carries one key more than the outer
    // query and the join-back matches nothing — NULL, or 0 after the COUNT_DISTINCT coalesce.
    it('keeps an aggregated field out of both the outer GROUP BY and the sleeve grain', () => {
      const { sql } = d.builder().buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        calculatedFields: [{ ...marginPlan(), isAggregatedByReport: true }],
        aggregations: [
          { column: 'spend__cost', function: 'SUM' },
          { column: 'margin', function: 'COUNT_DISTINCT' },
        ] as AggregationRule[],
      });

      expect(sql).toContain(
        `COUNT(DISTINCT (${expression})) AS ${d.alias('margin | COUNTUNIQUE')}`
      );
      expect(sql.slice(sql.lastIndexOf('GROUP BY'))).not.toContain(expression);
      // The sleeve keys on the column dimension alone — no second key, no join-back on the formula.
      expect(cteBody(sql, 'sleeve_spend__cost')).not.toContain(d.id('_owox_dim_1'));
      expect(sql).not.toContain(joinsBackOn('sleeve_spend__cost'));
    });

    // A blended report with NO sleeve reaches neither the count nor the membership assertion — the
    // guard that makes a half-applied change loud is absent there, so the case gets its own test.
    it('drops it from the grouping keys with no sleeve on the report at all', () => {
      const { sql } = d.builder().buildBlendedQuery({
        ...buildContext([spendChain()], ['channel']),
        fieldIndex: spendFieldIndex,
        calculatedFields: [{ ...marginPlan(), isAggregatedByReport: true }],
        aggregations: [{ column: 'margin', function: 'COUNT_DISTINCT' }] as AggregationRule[],
      });

      expect(sql).not.toContain('sleeve_');
      expect(sql).toContain(
        `COUNT(DISTINCT (${expression})) AS ${d.alias('margin | COUNTUNIQUE')}`
      );
      const outer = sql.slice(sql.lastIndexOf('\n\nSELECT\n'));
      expect(outer).toContain(`GROUP BY\n  ${d.ref('channel')}`);
      expect(outer.slice(outer.indexOf('GROUP BY'))).not.toContain(expression);
    });

    // The cast rule on the BLENDED outer SELECT. Both aggregated-field tests above use COUNT_DISTINCT,
    // which the rule excludes — so the cast could have been absent from this whole path with every
    // suite green. The two derivations are one method, but "one method" is a claim about the flat
    // path until a blended query is asked for the string.
    const aggregatedMarginSql = (declaredType: string): string =>
      d.builder().buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        calculatedFields: [{ ...marginPlan(), type: declaredType, isAggregatedByReport: true }],
        aggregations: [
          { column: 'spend__cost', function: 'SUM' },
          { column: 'margin', function: 'SUM' },
        ] as AggregationRule[],
      }).sql;

    // Both assertions are scoped to the OUTER SELECT, as the sibling above is. Matching against
    // the whole query would pass on the same string appearing in any CTE — which cannot happen
    // today (a calculated field is never sleeve-routed, so `margin | SUM` occurs once), but the
    // name of the test would stop being what it checks the moment a slice projects a labelled
    // metric into a CTE.
    it('casts the aggregated expression to the declared float in the outer SELECT', () => {
      const sql = aggregatedMarginSql(d.declaredFloat);
      const outer = sql.slice(sql.lastIndexOf('\n\nSELECT\n'));

      expect(outer).toContain(
        `SUM(CAST((${expression}) AS ${d.floatCast})) AS ${d.alias('margin | SUM')}`
      );
      // Still not a grouping key, and the cast must not have leaked into one. The GROUP BY is
      // asserted present first, so the slice below cannot silently become a no-op on -1.
      expect(outer).toContain(`GROUP BY\n  ${d.ref('channel')}`);
      expect(outer.slice(outer.indexOf('GROUP BY'))).not.toContain(expression);
    });

    // The integer family is refused the cast even though every dialect maps it, because the
    // cast would introduce a per-row rounding the warehouse was not doing — and Spark truncates
    // where the other four round, so the same blended report would total differently per storage.
    it('leaves an INTEGER-declared aggregated expression uncast in the outer SELECT', () => {
      const sql = aggregatedMarginSql(d.declaredInteger);
      const outer = sql.slice(sql.lastIndexOf('\n\nSELECT\n'));

      expect(outer).toContain(`SUM((${expression})) AS ${d.alias('margin | SUM')}`);
    });
  });
});
