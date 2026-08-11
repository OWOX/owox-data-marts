import { NotImplementedException } from '@nestjs/common';
import { BlendedQueryBuilder, BlendedQueryContext } from './blended-query-builder.interface';
import { DataStorageType } from '../enums/data-storage-type.enum';
import {
  ReportAggregateFunction,
  isPercentileFunction,
} from '../../dto/schemas/aggregate-function.schema';
import { SqlClauseRenderer, SqlParameter } from '../utils/sql-clause-renderer';
import { buildOptionalDateTruncUnitMap, buildTimeZoneMap } from '../utils/date-trunc-maps.utils';
import {
  ROW_COUNT_LABEL,
  UNIQUE_COUNT_LABEL,
  aggregatedColumnLabel,
  aggregationFunctionsForColumn,
} from '../../dto/schemas/aggregation-labels';
import { isFloatingPointType } from '../../dto/schemas/field-type-category';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { ColumnRefResolver, ColumnTypeResolver } from '../utils/sql-clause-renderer';
import { sanitizeSqlComment } from '../blending/sql-comment.utils';
import {
  KEPT_GROUPS_CTE,
  buildKeptGroupsJoinPairs,
  buildKeptGroupsProjection,
} from '../utils/kept-groups.utils';
import { BlendedSqlDialect, createColumnQualifier } from '../blending/blended-sql-dialect';
import { BlendCteBuilder } from '../blending/blend-cte.builder';
import { partitionBlendedFilters } from '../blending/blended-filter-partition';
import { MetricSleeveBuilder } from '../blending/metric-sleeve.builder';
import { collectSleeveMetrics, collectValueSleeveOwners } from '../blending/metric-sleeve.planner';

/**
 * Base class for blended SQL query builders.
 *
 * Produces CTE-based SQL using a **bottom-up** join strategy that guarantees
 * the result row count never exceeds the main data mart's row count.
 *
 * The algorithm works by processing leaf data marts first, aggregating them
 * by their join key to the parent, then LEFT JOINing the aggregated results
 * into the parent's raw data, and aggregating again — all the way up to the
 * root level. At each level the GROUP BY contains ONLY the join key to that
 * node's parent, ensuring at most one output row per parent-key value.
 *
 * Filter rules with `placement: 'pre-join'` are pushed down into the
 * subsidiary `*_raw` CTE so the joined data mart is narrowed before being
 * JOINed in. Filter rules with `placement: 'post-join'` (the default) are
 * applied to the final SELECT.
 *
 * Slice semantics: subsidiaries are LEFT JOINed, so a slice narrows the
 * subsidiary CTE but does NOT drop home rows (unmatched home rows pass through
 * with NULL). Use a post-join filter on top for row elimination.
 *
 * ```sql
 * WITH
 *   main AS (SELECT ... FROM <mainTable>),
 *
 *   -- leaf: aggregate by join key to parent
 *   c_raw AS (SELECT ... FROM <cTable>),
 *   c AS (SELECT parent_key, AGG(field) FROM c_raw GROUP BY parent_key),
 *
 *   -- intermediate: join raw data with aggregated children, then aggregate
 *   b_raw AS (SELECT ... FROM <bTable>),
 *   b_joined AS (SELECT b_raw.*, c.child_col FROM b_raw LEFT JOIN c ON ...),
 *   b AS (SELECT main_key, AGG(own_field), RE_AGG(child_col) FROM b_joined GROUP BY main_key)
 *
 * SELECT main.col, b.own_field, b.child_col
 * FROM main
 * LEFT JOIN b ON main.key = b.key
 * ```
 *
 * A joined COUNT DISTINCT / SUM / AVG metric is NOT read off those dedup CTEs — the dedup
 * already collapsed the join's fan-out, so re-aggregating it over- or under-counts. Each such
 * metric instead gets a "metric sleeve" CTE that re-joins the raw path and recomputes the
 * value at the report's own dimension grain; the outer query pulls it back with
 * `ANY_VALUE` over a NULL-safe join on the dimension tuple.
 *
 * This class owns the DIALECT and the orchestration of one query. The SQL itself lives in
 * `../blending/`, behind the narrow `BlendedSqlDialect` port this class supplies:
 * `BlendCteBuilder` (the CTE tree above), `MetricSleeveBuilder` (sleeve CTEs),
 * `metric-sleeve.planner` (which sleeves exist and what they are named — no SQL, no dialect)
 * and `partitionBlendedFilters` (pre-join vs post-join split).
 *
 * What a dialect subclass must supply: `identifierQuoteChar`, `clauseRenderer` and
 * `buildStringAgg` (abstract). What it MAY override: `buildAggregation` (aggregate spelling),
 * `buildAnyValue` (Athena needs `arbitrary()`), `buildRowSurrogate` (Redshift rejects a
 * constant window ORDER BY) and `quoteIdentifier` (Snowflake case folding).
 */
export abstract class AbstractBlendedQueryBuilder implements BlendedQueryBuilder {
  abstract readonly type: DataStorageType;

  protected abstract get identifierQuoteChar(): string;

  protected abstract get clauseRenderer(): SqlClauseRenderer | null;

  /**
   * The dialect surface the blending collaborators need. Built per call rather than cached in a
   * field: `clauseRenderer` and the aggregate hooks are overridden by subclasses (often over an
   * instance field), so they must be read after construction completes.
   */
  private dialectPort(): BlendedSqlDialect {
    return {
      quoteIdentifier: name => this.quoteIdentifier(name),
      quoteFieldRef: ref => this.quoteFieldRef(ref),
      buildAggregation: (fn, fieldName) => this.buildAggregation(fn, fieldName),
      buildRowSurrogate: partitionByRefs => this.buildRowSurrogate(partitionByRefs),
      clauseRenderer: () => this.clauseRenderer,
    };
  }

  /**
   * The `_kept_groups` CTE plus the semi-join that restricts a Totals query to the rows of the
   * groups its report actually shows (`context.groupRestriction`).
   *
   * It re-runs the report's own grouping over the SAME CTEs — dimensions, WHERE and HAVING —
   * and projects just the dimension tuple. A GROUP BY result has distinct tuples, so joining it
   * filters rows without duplicating any. Returns undefined when there is nothing to restrict.
   */
  private buildKeptGroupsCte(
    context: BlendedQueryContext,
    renderer: SqlClauseRenderer,
    qualifyColumn: ColumnRefResolver,
    postJoinFilters: FilterRule[],
    resolveColumnType?: ColumnTypeResolver
  ): { sql: string; params: SqlParameter[]; join: string; dimensions: string[] } | undefined {
    const restriction = context.groupRestriction;
    if (!restriction?.having.length) return undefined;

    const cteName = KEPT_GROUPS_CTE;
    // Same rendering as the report: its dimensions become the GROUP BY, and its metric filters
    // become the HAVING — so "the groups this query keeps" is decided by the exact expressions the
    // report used. Two things must come from the RESTRICTION rather than from this query:
    //  - NO aggregation rules. A Totals plan makes every selected numeric column a metric, so a
    //    dimension that is also one would stop being a GROUP BY key here — the HAVING would then
    //    be evaluated at the wrong grain, and the join would reference a key that was never
    //    projected.
    //  - the report's date buckets. Totals carry none of their own (no GROUP BY), so reading
    //    `context.dateTruncs` would regroup at the raw grain: `GROUP BY date` where the report
    //    grouped by month, and a month that clears the filter can have no single day that does.
    const restrictionDateTruncs = restriction.dateTruncs ?? [];
    const agg = renderer.renderAggregatedSelect(
      restriction.dimensions,
      [],
      buildOptionalDateTruncUnitMap(restrictionDateTruncs),
      {
        qualifyColumn,
        timeZoneByColumn: buildTimeZoneMap(restrictionDateTruncs),
        typeByColumn: context.columnTypes?.postJoin,
      }
    );
    const projection = buildKeptGroupsProjection(agg.groupByParts, restriction.dimensions, name =>
      this.quoteIdentifier(name)
    );
    const where = renderer.renderWhere(postJoinFilters, qualifyColumn, 'kgp', resolveColumnType);
    const having = renderer.renderHaving(
      restriction.having,
      qualifyColumn,
      'kgh',
      resolveColumnType
    );
    const cteBuilder = new BlendCteBuilder(this.dialectPort());
    const joinParts = cteBuilder.buildJoinParts(cteBuilder.buildTree(context.chains));

    const body =
      `SELECT\n      ${projection.join(',\n      ')}\n    FROM ${this.quoteIdentifier('main')}` +
      (joinParts.length > 0 ? '\n    ' + joinParts.join('\n    ') : '') +
      where.sql.replace(/\n/g, '\n    ') +
      agg.groupBySql.replace(/\n/g, '\n    ') +
      having.sql.replace(/\n/g, '\n    ');

    const label = sanitizeSqlComment(
      `groups kept by the report's metric filter(s) — Totals summarise only these rows`
    );
    const sql = `  -- ${label}\n  ${this.quoteIdentifier(cteName)} AS (\n    ${body}\n  )`;

    // No dimensions: the report is one grand-total group that the HAVING either keeps or drops,
    // so a CROSS JOIN reproduces exactly that (zero rows out when it dropped).
    const pairs = buildKeptGroupsJoinPairs(
      agg.groupByParts,
      restriction.dimensions,
      this.quoteIdentifier(cteName),
      name => this.quoteIdentifier(name),
      column => isFloatingPointType(context.columnTypes?.postJoin?.get(column))
    );
    const join =
      pairs.length > 0
        ? `JOIN ${this.quoteIdentifier(cteName)} ON ${renderer.renderNullSafeJoinOn(pairs)}`
        : `CROSS JOIN ${this.quoteIdentifier(cteName)}`;

    return {
      sql,
      params: [...where.params, ...having.params],
      join,
      dimensions: restriction.dimensions,
    };
  }

  /**
   * A HAVING rule targeting a sleeve metric's column (joined COUNT_DISTINCT, SUM or AVG) would
   * re-derive its aggregate expression from `qualifyColumn` — the dedup CTE — and so filter on the
   * OLD, wrong value rather than what the SELECT emits from the sleeve. The output-controls
   * validator rejects that combination at save time, but stating the invariant only in a comment
   * is how it comes back: this file throws for the GROUP BY drift invariant for exactly the same
   * reason, so enforce this one too.
   *
   * Takes the rules as ONE list because they arrive from two places: the outer query's post-join
   * filters and, for Totals, `groupRestriction.having`. Checking only the first left the entire
   * restriction outside the invariant — `_kept_groups` rendered `SUM(<dedupCte>.<col>)` for a
   * metric the report itself computes in a sleeve, which is the very thing this forbids.
   */
  private assertNoHavingOnSleeveMetric(
    rules: readonly FilterRule[],
    sleeveMetricKeys: ReadonlySet<string>
  ): void {
    const offending = rules.filter(
      r => r.function && sleeveMetricKeys.has(`${r.column}␟${r.function}`)
    );
    if (offending.length === 0) return;
    throw new Error(
      `buildBlendedQuery: metric filter(s) ` +
        `[${offending.map(r => `${r.function}(${r.column})`).join(', ')}] target a ` +
        `sleeve-routed joined metric — HAVING is rendered from the dedup CTE, not the ` +
        `sleeve, so it would filter on a different value than the SELECT returns. The ` +
        `output-controls validator rejects this combination; reaching the builder means it ` +
        `was bypassed`
    );
  }

  /** Metric-sleeve SQL emitter for this dialect. Exposed for its own unit tests. */
  protected createSleeveBuilder(): MetricSleeveBuilder {
    return new MetricSleeveBuilder(this.dialectPort());
  }

  buildBlendedQuery(context: BlendedQueryContext): { sql: string; params: SqlParameter[] } {
    const allFilters = context.filters ?? [];
    const uniqueCountSources = context.uniqueCountSources ?? [];
    const aggregated =
      (context.aggregations?.length ?? 0) > 0 ||
      (context.dateTruncs?.length ?? 0) > 0 ||
      context.rowCount === true ||
      (context.uniqueCount === true && (context.primaryKeyColumns?.length ?? 0) > 0) ||
      uniqueCountSources.length > 0;

    // Capability guard first — storages without a clauseRenderer can't honour any controls.
    const hasOutputControls =
      allFilters.length > 0 ||
      (context.sort?.length ?? 0) > 0 ||
      (context.limit ?? null) !== null ||
      aggregated;
    if (hasOutputControls && this.clauseRenderer === null) {
      throw new NotImplementedException(
        `Output controls not yet supported for storage type ${this.type}`
      );
    }

    const { preJoinByCte, postJoinFilters, resolveColumnType } = partitionBlendedFilters(
      context,
      this.type
    );

    const { mainTableReference, mainDataMartTitle, mainDataMartUrl, chains, columns } = context;
    const columnSet = new Set(columns);
    const referencedColumns = new Set<string>([
      ...columns,
      ...postJoinFilters.map(f => f.column),
      ...(context.sort ?? []).map(s => s.column),
      // Unique Count emits COUNT(DISTINCT main.<pk>) in the outer select, so the main CTE
      // must project the PK columns even when they aren't a selected/filtered/sorted column.
      ...(context.uniqueCount === true ? (context.primaryKeyColumns ?? []) : []),
      // A Totals query projects no dimensions and carries no HAVING of its own, but the
      // restriction CTE groups by those dimensions and filters on those metrics — so the source
      // CTEs must carry BOTH even though nothing in the outer SELECT mentions them. Omitting the
      // HAVING columns fails at the warehouse ("Name weight not found inside main"), which is the
      // loud half; omitting the dimensions silently qualifies them against the wrong CTE.
      ...(context.groupRestriction?.dimensions ?? []),
      ...(context.groupRestriction?.having ?? []).map(rule => rule.column),
    ]);
    // Row Count / Unique Count — and each joined source's `<source>__unique_count` — are
    // OUTER-SELECT aliases, not columns of any CTE. A sort (or HAVING) on one would otherwise flow
    // through collectMainReferences into the main raw CTE and emit
    // `SELECT "Unique Count" FROM <main table>` — a column that does not exist, so every run and
    // Generated SQL preview fails in the warehouse. Dropped here rather than per-source so filters
    // and any future ref source are covered too. A real column that legitimately owns the name
    // arrives via `columns`, so keep it when it is selected.
    for (const label of [
      UNIQUE_COUNT_LABEL,
      ROW_COUNT_LABEL,
      ...uniqueCountSources.map(s => s.outputLabel),
    ]) {
      if (!columnSet.has(label)) referencedColumns.delete(label);
    }

    const cteBuilder = new BlendCteBuilder(this.dialectPort());
    const roots = cteBuilder.buildTree(chains);

    const outputAliasToRoot = new Map<string, string>();
    const hiddenOutputAliases = new Set<string>();
    for (const root of roots) {
      cteBuilder.mapOutputAliasesToRoot(
        root,
        root.chain.cteName,
        outputAliasToRoot,
        hiddenOutputAliases
      );
    }

    const cteBlocks: string[] = [];
    const cteParams: SqlParameter[] = [];

    const mainColumns = cteBuilder.collectMainReferences(
      roots,
      referencedColumns,
      outputAliasToRoot
    );
    const mainRaw = cteBuilder.buildRawCte(
      'main',
      mainTableReference,
      mainDataMartTitle,
      mainDataMartUrl,
      mainColumns,
      /* preJoinFilters */ undefined
    );
    cteBlocks.push(mainRaw.sql);
    cteParams.push(...mainRaw.params);

    // C2.1: which chains' raw CTEs need the per-row surrogate (`__owox_rid`) — only a chain
    // that owns a joined SUM/AVG (a future value-sleeve metric) needs it; every other raw
    // CTE stays lean. The value sleeve itself (C2.2) and its routing (C2.3) land later.
    const valueSleeveOwners = collectValueSleeveOwners(
      context.aggregations ?? [],
      outputAliasToRoot,
      context
    );
    // A joined Unique Count counts `<cte>_raw.<key>`, and a declared key is frequently referenced
    // by nothing else — so it rides the same projection path the value sleeve's identity uses.
    const uniqueCountKeyColumns = new Map<string, readonly string[]>(
      uniqueCountSources.map(s => [s.cteName, s.pkColumns])
    );

    for (const root of roots) {
      const { ctes, params } = cteBuilder.buildSubtreeCtes(root, {
        preJoinByCte,
        resolveColumnType,
        valueSleeveOwners,
        uniqueCountKeyColumns,
      });
      cteBlocks.push(...ctes);
      cteParams.push(...params);
    }

    const joinParts = cteBuilder.buildJoinParts(roots);
    const qualifyColumn = createColumnQualifier(this.dialectPort(), outputAliasToRoot);
    const renderer = this.clauseRenderer;

    // Post-join aggregation: an outer GROUP BY over the flat blended result. The
    // bottom-up join guarantees that result has at most one row per main-mart row,
    // so this aggregates those per-main values across the group (the two-level
    // semantics). The CTE machinery and pre-join rollup are unchanged.
    if (aggregated && renderer) {
      // Sleeve metrics: every joined COUNT DISTINCT / SUM / AVG is computed in its own
      // CTE that re-joins the raw (pre-dedup) path at the report's dimension grain, instead of
      // re-aggregating the dedup CTE, which over- or under-counts on a fanning join.
      // Totals under a metric filter: recompute the groups the report itself keeps, as one more
      // CTE over the SAME sources, and semi-join it below. Without it a Totals row summarises
      // rows the report hides — and the fix must restrict ROWS, not add up per-group values,
      // or a symmetric aggregate (COUNT DISTINCT) would count an entity once per group.
      const sleeveMetrics = collectSleeveMetrics(context.aggregations ?? [], outputAliasToRoot);
      const sleeveMetricKeys = new Set(sleeveMetrics.map(m => `${m.column}\u241F${m.function}`));
      // Checked BEFORE anything renders a HAVING: both the outer query's and the restriction's
      // metric filters must stay off sleeve-routed metrics (see the throw for why).
      this.assertNoHavingOnSleeveMetric(
        [...postJoinFilters, ...(context.groupRestriction?.having ?? [])],
        sleeveMetricKeys
      );

      const keptGroups = this.buildKeptGroupsCte(
        context,
        renderer,
        qualifyColumn,
        postJoinFilters,
        resolveColumnType
      );
      if (keptGroups) {
        cteBlocks.push(keptGroups.sql);
        cteParams.push(...keptGroups.params);
      }

      const sleeves = this.createSleeveBuilder().buildAll(sleeveMetrics, context, {
        outputAliasToRoot,
        filters: postJoinFilters,
        resolveColumnType,
        keptGroups,
      });
      // Push each sleeve's SQL AND its WHERE params together, in WITH-clause order, so the
      // params array stays aligned with placeholder order for positional (Athena) binding.
      for (const s of sleeves) {
        cteBlocks.push(s.sql);
        cteParams.push(...s.params);
      }
      // Recomputed AFTER the sleeve CTEs are pushed so they're part of the WITH clause.
      const withClause = `WITH\n${cteBlocks.join(',\n\n')}`;

      // Exclude sleeve metrics from the normal aggregated SELECT — they'd otherwise
      // re-aggregate as SUM over the dedup CTE; they're pulled from their sleeve below instead.
      const nonSleeveAggs = (context.aggregations ?? []).filter(
        a => !sleeveMetricKeys.has(`${a.column}\u241F${a.function}`)
      );
      // A projected column whose ENTIRE aggregation list was sleeve metrics must also be
      // dropped from the columns passed to renderAggregatedSelect: with no aggregation
      // function left for it there, it would otherwise be misclassified as a bare GROUP
      // BY dimension (and duplicate the sleeve's own SELECT item under a different alias).
      const sleeveOnlyColumns = new Set(
        context.columns.filter(
          c =>
            aggregationFunctionsForColumn(context.aggregations ?? [], c).length > 0 &&
            aggregationFunctionsForColumn(nonSleeveAggs, c).length === 0
        )
      );
      const nonSleeveColumns = context.columns.filter(c => !sleeveOnlyColumns.has(c));

      const agg = renderer.renderAggregatedSelect(
        nonSleeveColumns,
        nonSleeveAggs,
        buildOptionalDateTruncUnitMap(context.dateTruncs),
        {
          includeRowCount: context.rowCount === true,
          includeUniqueCount: context.uniqueCount === true,
          primaryKeyColumns: context.primaryKeyColumns,
          qualifyColumn,
          timeZoneByColumn: buildTimeZoneMap(context.dateTruncs ?? []),
          typeByColumn: context.columnTypes?.postJoin,
        }
      );
      // the sleeve's join-back is only correct because `dimRefs.outer` is
      // byte-identical to the outer GROUP BY key for the same dimension — but the two are
      // derived INDEPENDENTLY (here via `renderAggregatedSelect`, in the sleeve via
      // `renderDimensionExpr`). That invariant already broke once in this feature's history
      // (a date-trunc'd dimension the sleeve projected untruncated → the NULL-safe join-back
      // matched nothing → the metric came back NULL for every row), and since a
      // COUNT_DISTINCT pull now COALESCEs to 0 such a miss would read as a confident zero
      // rather than an obvious NULL. Verify it instead of trusting it.
      const outerGroupByKeys = new Set(agg.groupByParts);
      // The same grouping key twice means the same column was projected twice: the sleeve
      // join-back would still work, but every count below compares against a de-duplicated set,
      // so say what is actually wrong instead of blaming the sleeve's grain.
      if (outerGroupByKeys.size !== agg.groupByParts.length) {
        throw new Error(
          `buildBlendedQuery: the outer query groups by the same key more than once ` +
            `[${agg.groupByParts.join(', ')}] — a column is projected twice`
        );
      }
      for (const s of sleeves) {
        // Both directions matter, and the DANGEROUS one is this: an outer GROUP BY key the
        // sleeve does NOT carry makes the LEFT JOIN match one sleeve row against several outer
        // groups, so ANY_VALUE hands each of them a value computed at a COARSER grain — a
        // plausible number, no NULL, no error. (The subset check below catches the opposite
        // drift, which announces itself as NULL/0.) The two sets are equal by construction
        // today; this asserts it rather than trusting two independent derivations to stay so.
        // Counted against the keys the outer query actually EMITS, not against the de-duplicated
        // set: a report listing the same column twice emits it twice, so comparing with the set
        // size reported a grain mismatch — pointing at the sleeve — for what is really a
        // duplicate projection. The distinct case gets its own message below.
        if (s.dimRefs.length !== agg.groupByParts.length) {
          throw new Error(
            `buildBlendedQuery: metric sleeve '${s.cteName}' groups by ${s.dimRefs.length} ` +
              `dimension(s) but the outer query groups by ${agg.groupByParts.length} ` +
              `[${agg.groupByParts.join(', ')}] — a sleeve at a coarser grain would spread ` +
              `one value across several outer groups instead of failing`
          );
        }
        for (const d of s.dimRefs) {
          if (!outerGroupByKeys.has(d.outer)) {
            throw new Error(
              `buildBlendedQuery: metric sleeve '${s.cteName}' would join back on ` +
                `'${d.outer}', which is not one of the outer GROUP BY keys ` +
                `[${[...outerGroupByKeys].join(', ')}] — the sleeve's dimension rendering has ` +
                `drifted from the aggregated SELECT's, so the join-back would silently match ` +
                `no rows (NULL metric, or 0 after the COUNT DISTINCT coalesce)`
            );
          }
        }
      }
      // One ANY_VALUE pull per METRIC (a merged group's several metrics each get their own
      // SELECT item) but the join-back below is still one per CTE — that shared join-back is
      // the point of merging.
      //
      // a counting sleeve pull is wrapped in COALESCE(..., 0). The sleeve
      // itself always computes the right value (COUNT is a counting function — 0 over zero
      // rows, never NULL), but the OUTER pull reads it through ANY_VALUE over the join-back
      // (CROSS JOIN for a grand total, LEFT JOIN per group) — and ANY_VALUE, like AVG, returns
      // NULL over an empty input set. That happens whenever the outer FROM clause contributes
      // zero rows for a bucket: a report WHERE that matches nothing (grand-total Totals), or a
      // LEFT-JOIN miss for one dimension group. Either way the correct read is 0, not NULL —
      // COALESCE restores the sleeve's own already-correct value. SUM and AVG are LEFT bare:
      // NULL-over-empty is the correct SQL aggregate semantics for those (no data is not the
      // same as a genuine zero), so coalescing them would misrepresent "no data" as "zero".
      // Which shape a pull is, is decided where it is BUILT (`SleevePull.coalesceEmptyToZero`) —
      // a joined Unique Count counts too but carries no aggregation rule to re-derive it from.
      const sleeveSelect = sleeves.flatMap(s =>
        s.pulls.map(p => {
          const pulled = this.buildAnyValue(
            `${this.quoteIdentifier(s.cteName)}.${this.quoteIdentifier(p.alias)}`
          );
          const value = p.coalesceEmptyToZero ? `COALESCE(${pulled}, 0)` : pulled;
          return `${value} AS ${this.quoteIdentifier(p.alias)}`;
        })
      );
      // No report dimensions (grand-total sleeve): the sleeve has exactly one row and no
      // GROUP BY, so a NULL-safe dimension-tuple ON (empty pairs → '') would be invalid SQL —
      // CROSS JOIN it instead.
      const sleeveJoins = sleeves.map(s =>
        s.dimRefs.length > 0
          ? `LEFT JOIN ${this.quoteIdentifier(s.cteName)} ON ${renderer.renderNullSafeJoinOn(
              s.dimRefs.map(d => ({
                left: d.outer,
                right: d.sleeve,
                nanSafe: isFloatingPointType(context.columnTypes?.postJoin?.get(d.column)),
              }))
            )}`
          : `CROSS JOIN ${this.quoteIdentifier(s.cteName)}`
      );
      // agg.selectSql can be empty (every requested column was sleeve-only, e.g. a lone
      // dimensionless COUNT_DISTINCT metric) — filter out empty pieces so we never emit a
      // stray leading comma.
      const selectSqlWithSleeves = [agg.selectSql, ...sleeveSelect]
        .filter(part => part.length > 0)
        .join(',\n  ');
      const body =
        `SELECT\n  ${selectSqlWithSleeves}\nFROM ${this.quoteIdentifier('main')}` +
        (joinParts.length > 0 ? '\n' + joinParts.join('\n') : '') +
        (keptGroups ? '\n' + keptGroups.join : '') +
        (sleeveJoins.length > 0 ? '\n' + sleeveJoins.join('\n') : '');
      const where = renderer.renderWhere(postJoinFilters, qualifyColumn, 'p', resolveColumnType);
      // Post-aggregation filters (rules carrying a `function`) become HAVING, using the
      // SAME qualified aggregate expression the SELECT emits. WHERE skips them above.
      const having = renderer.renderHaving(postJoinFilters, qualifyColumn, 'h', resolveColumnType);
      // A bare aggregated column is not in GROUP BY, so ORDER BY references the output alias
      // instead of the plain qualified column. `renderAggregatedSelect` documents the contract
      // as "an ORDER BY on a multi-aggregated column resolves to its FIRST aggregation" — first
      // in RULE order — and `agg.aliasByColumn` alone can no longer honour it: it is built from
      // `nonSleeveAggs`, so a column carrying BOTH a sleeve function and a non-sleeve one holds
      // the first NON-sleeve function there. A saved report sorting on such a column would
      // silently switch to a different metric (e.g. rules [SUM, MAX] sorted by MAX), changing
      // which rows survive LIMIT with no error — `SortRule` carries no function, so the user
      // cannot even express the intent again. Re-resolve every aggregated column from the FULL,
      // unfiltered rule list; dimensions keep the alias `renderAggregatedSelect` assigned.
      const aliasByColumnWithSleeves = new Map(agg.aliasByColumn);
      const aliasResolvedColumns = new Set<string>();
      for (const rule of context.aggregations ?? []) {
        if (aliasResolvedColumns.has(rule.column)) continue;
        aliasResolvedColumns.add(rule.column);
        aliasByColumnWithSleeves.set(
          rule.column,
          this.quoteIdentifier(aggregatedColumnLabel(rule.column, rule.function))
        );
      }
      const orderBy = renderer.renderOrderBy(
        context.sort ?? [],
        renderer.buildAggregatedAliasResolver(aliasByColumnWithSleeves)
      );
      const limit = renderer.renderLimit(context.limit ?? null);
      const sql = `${withClause}\n\n${body}${where.sql}${agg.groupBySql}${having.sql}${orderBy.sql}${limit.sql}`;
      return {
        sql,
        params: [
          ...cteParams,
          ...where.params,
          ...having.params,
          ...orderBy.params,
          ...limit.params,
        ],
      };
    }

    const withClause = `WITH\n${cteBlocks.join(',\n\n')}`;

    const selectParts = cteBuilder.buildSelectParts(
      columnSet,
      outputAliasToRoot,
      hiddenOutputAliases
    );
    const selectClause = selectParts.length > 0 ? selectParts.join(',\n  ') : '*';

    const body =
      `SELECT\n  ${selectClause}\nFROM ${this.quoteIdentifier('main')}` +
      (joinParts.length > 0 ? '\n' + joinParts.join('\n') : '');

    const where = renderer
      ? renderer.renderWhere(postJoinFilters, qualifyColumn, 'p', resolveColumnType)
      : { sql: '', params: [] as SqlParameter[] };
    const orderBy = renderer
      ? renderer.renderOrderBy(context.sort ?? [], qualifyColumn)
      : { sql: '', params: [] as SqlParameter[] };
    const limit = renderer
      ? renderer.renderLimit(context.limit ?? null)
      : { sql: '', params: [] as SqlParameter[] };
    const sql = `${withClause}\n\n${body}${where.sql}${orderBy.sql}${limit.sql}`;
    return { sql, params: [...cteParams, ...where.params, ...orderBy.params, ...limit.params] };
  }

  protected quoteIdentifier(name: string): string {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
    const q = this.identifierQuoteChar;
    return `${q}${name.split(q).join(q + q)}${q}`;
  }

  protected quoteFieldRef(ref: string): string {
    return ref
      .split('.')
      .map(seg => this.quoteIdentifier(seg))
      .join('.');
  }

  // Percentiles are delegated to the clause renderer rather than given a second per-dialect
  // override, so the blended and flat paths cannot spell them differently.
  protected buildAggregation(
    aggregateFunction: ReportAggregateFunction,
    fieldName: string
  ): string {
    if (isPercentileFunction(aggregateFunction)) {
      const renderer = this.clauseRenderer;
      if (!renderer) {
        throw new Error(
          `buildAggregation: ${aggregateFunction} needs a clause renderer to spell the ` +
            `percentile for this storage, and none is registered`
        );
      }
      return renderer.renderAggregateExpression(aggregateFunction, fieldName);
    }
    switch (aggregateFunction) {
      case 'STRING_AGG':
        return this.buildStringAgg(fieldName);
      case 'COUNT':
        return `COUNT(${fieldName})`;
      case 'COUNT_DISTINCT':
        return `COUNT(DISTINCT ${fieldName})`;
      case 'ANY_VALUE':
        return this.buildAnyValue(fieldName);
      default:
        return `${aggregateFunction}(${fieldName})`;
    }
  }

  protected buildAnyValue(fieldName: string): string {
    return `ANY_VALUE(${fieldName})`;
  }

  /**
   * SQL expression assigning a value distinct per raw row, PRE-fan-out — the synthetic
   * owner-identity surrogate a value-sleeve dedups on: `DISTINCT (dim, <this>, value)`. Emitted for
   * EVERY value-sleeve owner, not only a keyless one: a declared key with a NULL component falls
   * back to the surrogate, so it has to be projected either way. Genuine duplicate raw rows are
   * deliberately counted as distinct owners here — a documented, later follow-up.
   *
   * Default `ROW_NUMBER() OVER (ORDER BY 1)`: BigQuery, Snowflake, Trino/Presto (Athena)
   * and Databricks/Spark all resolve an integer literal in a window's ORDER BY as a plain
   * constant expression, NOT as an ordinal reference into the outer SELECT list (that
   * ordinal shorthand is a distinct grammar production that applies only to a top-level
   * query's own ORDER BY). ROW_NUMBER() still assigns a distinct sequential value to every
   * row even when every row ties on that constant — the specific order is irrelevant here,
   * only distinctness is. Snowflake's docs say this explicitly: "The ORDER BY clause for
   * window functions does not support the use of an ordinal position... `2` is interpreted
   * as the constant `2`". Redshift is the one dialect that rejects this: its window ORDER
   * BY requires an actual column identifier and explicitly disallows constants ("Neither
   * constants nor constant expressions can be used as substitutes for column names" — AWS
   * Redshift docs) — see `RedshiftBlendedQueryBuilder.buildRowSurrogate`'s override.
   */
  protected buildRowSurrogate(partitionByRefs: readonly string[] = []): string {
    const partition = partitionByRefs.length ? `PARTITION BY ${partitionByRefs.join(', ')} ` : '';
    return `ROW_NUMBER() OVER (${partition}ORDER BY 1)`;
  }

  /**
   * The dialect's string concatenation for a pre-join roll-up.
   *
   * MUST be deterministic — `LISTAGG … WITHIN GROUP (ORDER BY …)`, `array_join(array_agg(…))` over
   * a sorted array, and so on. Not a style preference: since the dedup CTE holding this
   * value is read TWICE in one query (the outer SELECT and a metric sleeve), and the sleeve joins
   * back on the rolled-up value. Two different orderings of the same set are two different
   * strings, so a non-deterministic implementation makes that join match nothing — the metric
   * comes back NULL, or 0 once a COUNT DISTINCT pull coalesces, with no error anywhere. All three
   * dialects that spell this were changed for exactly that reason; the obvious implementation on
   * a new warehouse is the unordered one.
   */
  protected abstract buildStringAgg(fieldName: string): string;
}
