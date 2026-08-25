import { NotImplementedException } from '@nestjs/common';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import {
  BlendedFieldEntry,
  BlendedQueryBuilder,
  BlendedQueryContext,
} from './blended-query-builder.interface';
import { DataStorageType } from '../enums/data-storage-type.enum';
import {
  ReportAggregateFunction,
  isPercentileFunction,
} from '../../dto/schemas/aggregate-function.schema';
import {
  CalculatedFieldRenderOptions,
  CalculatedMetricPlan,
  SqlClauseRenderer,
  SqlParameter,
  assertNoHavingRules,
  composePlainSelectBody,
  hasAggregateCalculatedMetric,
} from '../utils/sql-clause-renderer';
import { isCalculatedGroupingKey } from '../../calculated-fields/calculated-plan-grain';
import { buildOptionalDateTruncUnitMap, buildTimeZoneMap } from '../utils/date-trunc-maps.utils';
import {
  UNIQUE_COUNT_LABEL,
  aggregatedColumnLabel,
  aggregationFunctionsForColumn,
} from '../../dto/schemas/aggregation-labels';
import { isFloatingPointType } from '../../dto/schemas/field-type-category';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import {
  CalculatedPredicateOperand,
  ColumnRefResolver,
  ColumnTypeResolver,
} from '../utils/sql-clause-renderer';
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
import {
  FormulaSleevePlan,
  collectSleeveMetrics,
  collectValueSleeveOwners,
  isIdentityPreJoinField,
  isJoinedCallLeftInPlace,
  planFormulaSleeves,
} from '../blending/metric-sleeve.planner';
import { SleevePull } from '../blending/blended-query.types';
import {
  FormulaSpanReplacement,
  parseFormulaReferences,
  renderFormula,
} from '../../calculated-fields/formula-reference';
import {
  isLiveReference,
  liveFormulaReferences,
} from '../../calculated-fields/formula-live-reference';
import { scanSql } from '../../calculated-fields/sql-token-scanner';
import { isDistinctCountingFormulaFunction } from '../../calculated-fields/formula-function-dialect';
import type { FormulaReference } from '../../calculated-fields/formula-reference';

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
  protected dialectPort(): BlendedSqlDialect {
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
    calculatedFieldRenderOptions: CalculatedFieldRenderOptions,
    calculatedPredicateExpressions: ReadonlyMap<string, CalculatedPredicateOperand>,
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
    // A calculated field the report GROUPS BY is a real grouping key of the report (#6732), so the
    // restriction reproduces it as its own rendered expression — the flat renderer's three moves
    // (`renderKeptGroupsJoin`). Only a grouping key becomes one: an aggregate-level plan already IS
    // an aggregate, and a row-level one the report aggregates stopped being a key. So the
    // calculated keys are a FILTERED SUBSEQUENCE of `calculatedDimensions`, and `dimensions` is
    // rebuilt from that same filtered array rather than taken as given: the pairing below indexes
    // the two together, and an off-by-one there is a wrong number, not an error.
    const calculatedDimensions = (restriction.calculatedDimensions ?? []).filter(
      isCalculatedGroupingKey
    );
    const calculatedNames = new Set(calculatedDimensions.map(metric => metric.outputName));
    const columnDimensions = restriction.dimensions.filter(name => !calculatedNames.has(name));
    // Column keys first in projection order, then the row-level ones in plan order — the order
    // `renderAggregatedSelect` emits `groupByParts` in.
    const dimensions = [...columnDimensions, ...calculatedDimensions.map(m => m.outputName)];
    const agg = renderer.renderAggregatedSelect(
      columnDimensions,
      [],
      buildOptionalDateTruncUnitMap(restrictionDateTruncs),
      {
        qualifyColumn,
        timeZoneByColumn: buildTimeZoneMap(restrictionDateTruncs),
        typeByColumn: context.columnTypes?.postJoin,
        calculatedMetrics: calculatedDimensions.length > 0 ? calculatedDimensions : undefined,
        // The SAME object the outer SELECT and every sleeve render their formulas with: this
        // join clause is reused verbatim inside each sleeve, whose FROM is `main`, so the
        // expression must resolve there to the identical string.
        ...calculatedFieldRenderOptions,
      }
    );
    const projection = buildKeptGroupsProjection(agg.groupByParts, dimensions, name =>
      this.quoteIdentifier(name)
    );
    const where = renderer.renderWhere(
      postJoinFilters,
      qualifyColumn,
      'kgp',
      resolveColumnType,
      calculatedPredicateExpressions
    );
    // This CTE projects the dimension tuple alone, so nothing here renders the aggregate the report
    // printed and there is no `aggregateArgumentByLabel` to pass on — it comes from the
    // restriction's own plans, through the same seats and the same options object the projection
    // above used (D18), so a filter on an aggregated calculated field compares one string here and
    // in the report rather than two derivations of it.
    const having = renderer.renderHaving(
      restriction.having,
      qualifyColumn,
      'kgh',
      resolveColumnType,
      renderer.buildCalculatedAggregateArguments(
        restriction.calculatedHavingMetrics,
        restriction.having,
        calculatedFieldRenderOptions
      ),
      calculatedPredicateExpressions
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
      dimensions,
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
      dimensions,
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
      r => r.function && sleeveMetricKeys.has(`${r.column}\u241F${r.function}`)
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

  /**
   * How the outer query reads one sleeve's value back. `ANY_VALUE` over the join-back, because the
   * sleeve holds exactly one row per group; `COALESCE(…, 0)` on top for a counting metric, whose
   * sleeve already answers 0 over zero rows while the pull's `ANY_VALUE` would answer NULL for a
   * group the join-back does not reach. Which shape a pull is, is decided where it is BUILT
   * (`SleevePull.coalesceEmptyToZero`).
   *
   * Shared by the two sites that read a pull — an ordinary sleeve's own SELECT item, and a formula
   * sleeve's expression spliced into its metric — so the two cannot spell it differently.
   */
  private sleevePullExpression(cteName: string, pull: SleevePull): string {
    const pulled = this.buildAnyValue(
      `${this.quoteIdentifier(cteName)}.${this.quoteIdentifier(pull.alias)}`
    );
    return pull.coalesceEmptyToZero ? `COALESCE(${pulled}, 0)` : pulled;
  }

  /**
   * Blended output alias per joined field, keyed by the structural identity a `{{ref}}` tag
   * carries — its alias path and the source's ORIGINAL field name — never by the unified name a
   * column picker speaks. A field the index does not carry (a join key, say) is absent: it has no
   * declared pre-join roll-up, so its raw column IS its meaning.
   */
  private buildJoinedFieldAliasIndex(
    fieldIndex: ReadonlyMap<string, BlendedFieldEntry> | undefined
  ): ReadonlyMap<string, string> {
    const byIdentity = new Map<string, string>();
    for (const [name, entry] of fieldIndex ?? []) {
      byIdentity.set(`${entry.aliasPath}\u241F${entry.originalFieldName}`, name);
    }
    return byIdentity;
  }

  /**
   * A joined aggregate call's argument, rendered against its owner, and WHICH of the owner's two
   * row sets it was rendered against.
   *
   * A calculated metric is computed at the last join, AFTER dedup — and reading the dedup CTE IS
   * "after dedup", which is what the sleeve makes safe at the report's grain. So the choice is the
   * same `isIdentityPreJoinField` classification the value sleeve branches on, applied to the
   * fields the argument reads: a joined field's declared pre-join `aggregateFunction` is what that
   * field MEANS once blended, so a formula naming it must read the value a report metric on it
   * reads. A lone rolled-up field is read off the owner's dedup CTE, where that roll-up lives;
   * anything with no roll-up to honour is read off the owner's RAW rows — which is also the only
   * thing a row-level product of two of the owner's columns can be computed from.
   *
   * SEVERAL fields where any one carries a real roll-up is REFUSED: each was collapsed separately,
   * to one value per join key, and a product of sums is not a sum of products — so no row set
   * computes what the analyst wrote, and computing it raw would silently contradict the field's own
   * declared meaning. The refusal covers a DISTINCT-COUNTING call too, and must: a single reference
   * is exempted from the roll-up only because a report metric on that field answers the same way,
   * and a multi-field EXPRESSION has no report counterpart to inherit that from.
   *
   * It does NOT cover a plain joined `COUNT`, and deliberately so — that call never reaches here,
   * because `planFormulaSleeves` leaves it in the outer SELECT (see `isJoinedCallLeftInPlace`).
   * `COUNT(a * b)` over the dedup CTE counts the MAIN rows whose product is non-null, which IS the
   * ruled reading ("computed at the last join, after dedup"), so it is allowed and stays allowed.
   * The message above therefore names the CALL it refuses rather than claiming a general rule about
   * combining a summarised field with another column — the rule that would be false for COUNT.
   *
   * A DISTINCT-COUNTING call over one field always reads RAW, mirroring the report path's own
   * COUNT_DISTINCT sleeve and for its stated reason: counting distinct roll-ups conflates raw
   * values that happen to roll up alike. Keyed on `isDistinctCountingFormulaFunction` as well as on
   * the quantifier, so `APPROX_COUNT_DISTINCT(x)` — which carries no keyword — is not answered off
   * the roll-up while `COUNT(DISTINCT x)` is answered off the raw rows.
   */
  private renderFormulaSleeveValue(
    plan: FormulaSleevePlan,
    metric: CalculatedMetricPlan,
    context: BlendedQueryContext,
    aliasByJoinedField: ReadonlyMap<string, string>
  ): { valueSql: string; isIdentity: boolean } {
    const identityOf = (ref: { path: string; field: string }): string | undefined =>
      aliasByJoinedField.get(`${ref.path}\u241F${ref.field}`);
    const fieldIndex = context.fieldIndex;
    // Keyed by the FIELD, not by each occurrence: `sessions * sessions` names one field twice, and
    // one field is still one already-collapsed value per join key.
    const fields = new Map(plan.call.refs.map(ref => [`${ref.path}.${ref.field}`, ref]));
    const rolledUp = [...fields].filter(
      ([, ref]) =>
        fieldIndex !== undefined &&
        identityOf(ref) !== undefined &&
        !isIdentityPreJoinField(identityOf(ref)!, fieldIndex, context)
    );
    if (rolledUp.length > 0 && fields.size > 1) {
      const names = rolledUp.map(([name]) => name);
      const fn = plan.distinct ? `${plan.call.fn}(DISTINCT …)` : `${plan.call.fn}(…)`;
      throw new BusinessViolationException(
        `The calculated field '${metric.outputName}' aggregates ` +
          `[${names.join(', ')}] inside ${fn}, in an expression that reads more than one field of ` +
          `'${plan.aliasPath}'. The join summarised each of those fields SEPARATELY, to one value ` +
          `per join key, so no row set computes this expression — split it into one ${fn} per field`,
        {
          calculatedField: metric.outputName,
          preJoinAggregatedFields: names,
          function: plan.call.fn,
        }
      );
    }
    const isIdentity =
      plan.distinct || isDistinctCountingFormulaFunction(plan.call.fn) || rolledUp.length === 0;
    const rawAlias = this.quoteIdentifier(`${plan.ownerCteName}_raw`);
    const dedupAlias = this.quoteIdentifier(plan.ownerCteName);
    return {
      isIdentity,
      // `trimStart` only: a trailing line comment inside the argument is terminated by the newline
      // the slice ends with, and trimming that away would comment out the slot's own `AS _val`.
      valueSql: renderFormula(
        metric.formula.slice(plan.valueStart, plan.call.argEnd).trimStart(),
        ref => {
          const column = isIdentity ? undefined : identityOf(ref);
          return column === undefined
            ? `${rawAlias}.${this.quoteFieldRef(ref.field)}`
            : `${dedupAlias}.${this.quoteIdentifier(column)}`;
        }
      ),
    };
  }

  /**
   * How ONE reference of a calculated metric's formula becomes SQL in the OUTER SELECT — the site
   * that renders every call this query did not lift into a sleeve.
   *
   * A joined reference resolves through its unified blended name, so it qualifies to
   * `<root>.<alias>` — the dedup CTE — exactly as a report column on that field does. Resolving it
   * by the raw field name instead, which is all the flat renderer can do, would emit
   * `main.<rawField>`: an unrecognised name, or a wrong number when main owns a column of that name.
   */
  private resolveFormulaReference(
    ref: FormulaReference,
    aliasByJoinedField: ReadonlyMap<string, string>,
    qualifyColumn: ColumnRefResolver
  ): string {
    const column =
      ref.path === '' ? ref.field : aliasByJoinedField.get(`${ref.path}\u241F${ref.field}`);
    // A joined reference this query cannot resolve is refused before rendering, so the fallback is
    // reachable only for an own-Data-Mart reference.
    return qualifyColumn(column ?? ref.field);
  }

  /**
   * Refuses a calculated metric whose formula cannot be routed across Data Marts, before anything
   * is emitted.
   *
   * `buildFormulaOwnerPlan` hands a mixed-owner call back as own-owner — there is no single grain at
   * which `SUM(cost * orders.amount)` is defined — so without this the call renders in the outer
   * SELECT with its joined field qualified against `main`: an unrecognised name when main has no
   * such column, and a plausible WRONG NUMBER when it happens to have one.
   *
   * A joined call NESTED in another is refused here too. `FORMULA_NESTED_AGGREGATE` gates it at
   * save, so this is the saved-before-the-gate case; left alone it reaches
   * `renderFormulaWithReplacements` as two overlapping spans and surfaces as a bare `Error` — a 500
   * whose body carries nothing the analyst can act on.
   */
  private assertFormulaOwnershipIsRoutable(metrics: readonly CalculatedMetricPlan[]): void {
    for (const metric of metrics) {
      const mixed = (metric.formulaOwnership?.violations ?? []).filter(
        v => v.kind === 'mixed-owner-call'
      );
      if (mixed.length > 0) {
        throw new BusinessViolationException(
          `The calculated field '${metric.outputName}' has an aggregate that reads more than one ` +
            `Data Mart: ` +
            `${mixed.map(v => `${v.fn}(...) over [${v.paths.map(p => p || "the calculated field's own Data Mart").join(', ')}]`).join('; ')}. ` +
            `There is no single grain at which that is defined — split it into one aggregate call ` +
            `per Data Mart`,
          { calculatedField: metric.outputName }
        );
      }
      // Either side being joined is enough. Refs are attributed to the INNERMOST containing call,
      // so an outer call wrapping nothing but a joined one owns no refs and classifies as
      // own-owner: `SUM(COUNT({{orders.amount}}))` escaped a joined-only pairing and emitted
      // `SUM(COUNT(orders.orders__amount))` — a warehouse error carrying no metric name.
      const calls = metric.formulaOwnership?.plan.calls ?? [];
      const nested = calls.find(inner =>
        calls.some(
          outer =>
            outer !== inner &&
            inner.start >= outer.start &&
            inner.end <= outer.end &&
            (inner.owner.kind === 'joined' || outer.owner.kind === 'joined')
        )
      );
      if (nested) {
        throw new BusinessViolationException(
          `The calculated field '${metric.outputName}' nests the aggregate ${nested.fn}(...) ` +
            `inside another aggregate, and one of the two reads a joined Data Mart. An aggregate ` +
            `cannot be computed over another aggregate's result — compute the inner one in a ` +
            `calculated field of its own`,
          { calculatedField: metric.outputName }
        );
      }
    }
  }

  /**
   * Every LIVE joined reference of a formula must end up as SQL over the source it names. There are
   * exactly two ways: inside a call this query lifted into a sleeve (the whole span is replaced), or
   * inside a call the outer SELECT computes itself, where the reference resolves through its
   * unified blended name to `<root>.<alias>`.
   *
   * Anything else renders as `main.<rawField>` — an unrecognised name, or a wrong number when main
   * owns a column of that name. So a reference must be replaced, or sit inside the ONE call shape
   * the planner deliberately leaves in place (`isJoinedCallLeftInPlace` — a non-DISTINCT joined
   * `COUNT`) AND resolve to a blended column this query can qualify.
   *
   * That second arm used to read "inside some aggregate", which let a joined `SUM` whose sleeve
   * vanished between planning and emission pass: its reference is resolvable and does sit inside an
   * aggregate, so it rendered `SUM(<dedup>.<col>)` — the fan-out-inflated number the sleeve exists
   * to prevent. Replacement is checked against the spans ACTUALLY built rather than against the
   * plan, so with the arm narrowed a lost sleeve is now genuinely caught. A commented-out reference
   * is not live SQL and is deliberately not counted.
   */
  private assertJoinedReferencesRouted(
    metric: CalculatedMetricPlan,
    replacements: readonly FormulaSpanReplacement[],
    aliasByJoinedField: ReadonlyMap<string, string>,
    outputAliasToRoot: ReadonlyMap<string, string>
  ): void {
    const tokens = scanSql(metric.formula);
    const calls = metric.formulaOwnership?.plan.calls ?? [];
    const unrouted = parseFormulaReferences(metric.formula).filter(ref => {
      if (ref.path === '' || !isLiveReference(tokens, ref)) return false;
      if (replacements.some(span => ref.start >= span.start && ref.end <= span.end)) return false;
      const alias = aliasByJoinedField.get(`${ref.path}\u241F${ref.field}`);
      const inPlace = calls.some(
        c =>
          ref.start >= c.start &&
          ref.end <= c.end &&
          c.owner.kind === 'joined' &&
          c.owner.aliasPath === ref.path &&
          isJoinedCallLeftInPlace(tokens, c)
      );
      return !inPlace || alias === undefined || !outputAliasToRoot.has(alias);
    });
    if (unrouted.length === 0) return;
    throw new BusinessViolationException(
      `The calculated field '${metric.outputName}' reads ` +
        `[${unrouted.map(ref => `${ref.path}.${ref.field}`).join(', ')}] from a joined Data Mart, ` +
        `but this query cannot resolve ${unrouted.length > 1 ? 'them' : 'it'} to that source. A ` +
        `joined field is readable only inside an aggregate call, and only while the join that ` +
        `brings it in is still part of the report`,
      { calculatedField: metric.outputName }
    );
  }

  buildBlendedQuery(context: BlendedQueryContext): { sql: string; params: SqlParameter[] } {
    const allFilters = context.filters ?? [];
    const uniqueCountSources = context.uniqueCountSources ?? [];
    const calculatedMetrics = context.calculatedMetrics ?? [];
    const aggregated =
      (context.aggregations?.length ?? 0) > 0 ||
      (context.dateTruncs?.length ?? 0) > 0 ||
      (context.uniqueCount === true && (context.primaryKeyColumns?.length ?? 0) > 0) ||
      uniqueCountSources.length > 0 ||
      // An AGGREGATING calculated field is an aggregate (spec §2.3), so selecting one makes the
      // query aggregated even with no aggregation rules — the remaining columns become its
      // grouping keys. A row-level one is a dimension and does not (#6732). FILTERING on one does
      // the same and for the same reason: the field is the only thing that would have made the
      // query aggregated, so without this a report that filters on one without selecting it takes
      // the ungrouped branch, where its predicate belongs to no clause at all.
      hasAggregateCalculatedMetric([
        ...calculatedMetrics,
        ...(context.calculatedFilterMetrics ?? []),
      ]);

    // Capability guard first — storages without a clauseRenderer can't honour any controls.
    const hasOutputControls =
      allFilters.length > 0 ||
      (context.sort?.length ?? 0) > 0 ||
      (context.limit ?? null) !== null ||
      aggregated ||
      // A ROW-LEVEL field leaves `aggregated` false, and only the renderer can spell its formula —
      // without this the column would be silently dropped rather than refused (spec §4).
      calculatedMetrics.length > 0;
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
    // Every formula this query renders anywhere. A Totals plan projects no dimensions, so its
    // row-level fields are deliberately absent from `calculatedMetrics` and travel on the group
    // restriction instead — but the kept-groups CTE renders them, so their names and their
    // columns are subject to exactly the same two rules below (#6732).
    //
    // A DEPENDENCY is one of those rendered formulas: since a formula may read another Calculated
    // Field, the outer SELECT emits the SUBSTITUTED text, so the columns behind it are `amount` and
    // `spend`, never `revenue` and `cost`. Both rules below therefore have to walk the closure —
    // otherwise the main raw CTE projects the dependency's NAME (which no warehouse column may own)
    // and omits the columns the query actually reads: `Unrecognized name`, twice over. The closure
    // is flat, so one level of flattening is the whole of it.
    //
    // A FILTERED field counts as rendered too, selected or not (#6732 spec §2): its formula IS the
    // predicate's left-hand side, so the columns behind it are read by this query — and its own
    // name arrives in `referencedColumns` through the filter rule below, where nothing else would
    // take it out. Omitting it therefore failed twice over, `Unrecognized name` each time: the
    // main raw CTE projected `ctr` (no warehouse column may own a formula's name) and not the
    // `clicks` and `impressions` the predicate actually reads.
    const renderedFormulas = [
      ...calculatedMetrics,
      ...(context.calculatedFilterMetrics ?? []),
      ...(context.groupRestriction?.calculatedDimensions ?? []),
    ].flatMap(plan => [plan, ...(plan.dependencies ?? [])]);
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
      // A calculated metric's own name is never a column, but the main columns its formula reads
      // are — and nothing else references them, so without this the outer SELECT says
      // `main."cost"` over a main CTE that never projected `cost`.
      //
      // OWN-Data-Mart references only (`path === ''`). A joined reference's `field` is the JOINED
      // mart's own column name, and this set feeds `collectMainReferences` alone — so adding one
      // puts `SELECT amount FROM <main table>` in the main CTE. Its owner's `<alias>_raw` is where
      // it has to be projected, which the service arranges by naming the field as referenced.
      //
      // LIVE references only, like every other reader of a stored formula: a commented-out tag is
      // text the warehouse never evaluates, so the column behind it may well be gone — and
      // projecting it here fails the whole blended query with `Unrecognized name` from a CTE the
      // analyst cannot see, while the flat path (which never reads this) runs fine.
      ...renderedFormulas.flatMap(metric =>
        liveFormulaReferences(metric.formula)
          .filter(ref => ref.path === '')
          .map(ref => ref.field)
      ),
    ]);
    // Unique Count — and each joined source's `<source>__unique_count` — are
    // OUTER-SELECT aliases, not columns of any CTE. A sort (or HAVING) on one would otherwise flow
    // through collectMainReferences into the main raw CTE and emit
    // `SELECT "Unique Count" FROM <main table>` — a column that does not exist, so every run and
    // Generated SQL preview fails in the warehouse. Dropped here rather than per-source so filters
    // and any future ref source are covered too. A real column that legitimately owns the name
    // arrives via `columns`, so keep it when it is selected.
    for (const label of [UNIQUE_COUNT_LABEL, ...uniqueCountSources.map(s => s.outputLabel)]) {
      if (!columnSet.has(label)) referencedColumns.delete(label);
    }
    // A metric name is an outer-SELECT alias too (a sort on one resolves through
    // `buildAggregatedAliasResolver`'s bare-alias fallback), and unconditionally so — no warehouse
    // column can own a calculated field's name, so it must never reach the main raw CTE. The
    // restriction's own row-level fields are included: their NAMES arrive above with
    // `groupRestriction.dimensions`, and stripping only `calculatedMetrics` left a Totals query
    // emitting `SELECT session_key FROM <main table>` — `Unrecognized name` (#6732).
    for (const metric of renderedFormulas) referencedColumns.delete(metric.outputName);

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

    // Every formula whose OWNERSHIP this query has to be able to route — all THREE channels a
    // formula reaches the SQL through, because a guard that walks one of them is a guard the other
    // two do not have.
    //
    // A FILTERED field's formula is emitted SQL exactly as a selected one's is (it is the
    // predicate's left-hand side), and a RESTRICTION dimension's is rendered by the kept-groups CTE
    // — which a Totals plan relies on precisely BECAUSE it projects no dimensions, so its row-level
    // fields are deliberately absent from `calculatedMetrics`. Neither reaches either of the two
    // ways a selected formula's joined call is routed, since nothing plans a sleeve for them.
    //
    // Iterating the selected metrics alone left both with no ownership check at all, and neither
    // failure announces itself: a mixed-owner call renders `main.<field>`, a wrong number wherever
    // main owns a column of that name; and a joined reference in a restriction dimension resolves
    // through the shared options object to the joined mart's DEDUP CTE, so the restriction runs,
    // keyed on a post-roll-up value instead of the report's grain, and Totals cover a different row
    // set than the report shows.
    const routableFormulas = [
      ...calculatedMetrics,
      ...(context.calculatedFilterMetrics ?? []),
      ...(context.groupRestriction?.calculatedDimensions ?? []),
    ];

    // One sleeve per JOINED aggregate call of a calculated metric's formula (#6732). Planned and
    // RENDERED here, ahead of the raw CTEs: a sleeve reading the owner's raw rows needs the row
    // identity projected into `<alias>_raw`, no aggregation rule mentions that chain, and only the
    // rendered classification says which sleeves those are.
    this.assertFormulaOwnershipIsRoutable(routableFormulas);
    const aliasByJoinedField = this.buildJoinedFieldAliasIndex(context.fieldIndex);
    const metricByOutputName = new Map(calculatedMetrics.map(m => [m.outputName, m]));
    const formulaSleeveInputs = planFormulaSleeves(
      calculatedMetrics
        .filter(metric => metric.formulaOwnership !== undefined)
        .map(metric => ({
          outputName: metric.outputName,
          formula: metric.formula,
          ownerPlan: metric.formulaOwnership!.plan,
        }))
    ).map(plan => ({
      plan,
      ...this.renderFormulaSleeveValue(
        plan,
        metricByOutputName.get(plan.metricOutputName)!,
        context,
        aliasByJoinedField
      ),
    }));

    // C2.1: which chains' raw CTEs need the per-row surrogate (`__owox_rid`) — only a chain
    // that owns a joined SUM/AVG (a future value-sleeve metric) needs it; every other raw
    // CTE stays lean. The value sleeve itself (C2.2) and its routing (C2.3) land later.
    const valueSleeveOwners = collectValueSleeveOwners(
      context.aggregations ?? [],
      outputAliasToRoot,
      context,
      // Only the sleeves that read RAW: one reading a pre-join roll-up keys off the owner dedup
      // CTE's own group key, so projecting the surrogate for it is a window sort nothing reads.
      formulaSleeveInputs.filter(input => input.isIdentity).map(input => input.plan)
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

    // A formula sleeve's pull is SPLICED into its metric's expression at the call's own site, so
    // it needs that call's span — which only the plan carries. Declared HERE, ahead of everything
    // that renders a formula, so ONE options object serves the kept-groups CTE, every sleeve's
    // dimension rendering and the outer SELECT's: byte-identity by construction rather than by
    // several derivations agreeing. It is still empty when the sleeve builder reads it, and that
    // is exactly right — only an AGGREGATE call gets a sleeve, so a row-level plan never has an
    // entry in it either way.
    const formulaReplacements = new Map<string, FormulaSpanReplacement[]>();
    const calculatedFieldRenderOptions: CalculatedFieldRenderOptions = {
      qualifyColumn,
      calculatedMetricReplacements: formulaReplacements,
      // A joined call this query did not lift into a sleeve — a `COUNT`, which the report path
      // also computes here — still renders at this site, and its references must resolve to the
      // dedup CTE rather than to `main`.
      resolveCalculatedMetricReference: ref =>
        this.resolveFormulaReference(ref, aliasByJoinedField, qualifyColumn),
    };

    // A predicate on a Calculated Field compares its FORMULA (#6732 spec §2) — its name is an
    // outer SELECT alias, not a column of any CTE. Rendered through the SAME options object as the
    // projection above, so the two spellings of one formula cannot drift. Only the FILTERED fields
    // are rendered here: a selected metric whose joined call becomes a sleeve has its call site
    // spliced later, and a map built from it now would hold the pre-splice expression — but D22
    // refuses a filter on such a field, so nothing here ever needs the splice.
    const calculatedPredicateExpressions = renderer
      ? renderer.buildCalculatedPredicateExpressions(
          context.calculatedFilterMetrics,
          calculatedFieldRenderOptions
        )
      : new Map<string, CalculatedPredicateOperand>();

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
        calculatedFieldRenderOptions,
        calculatedPredicateExpressions,
        resolveColumnType
      );
      if (keptGroups) {
        cteBlocks.push(keptGroups.sql);
        cteParams.push(...keptGroups.params);
      }

      // A calculated field that is a GROUPING KEY (#6732): the outer GROUP BY keys on its
      // expression, so every sleeve has to carry the same key or its join-back reads a coarser
      // grain. Read off the plan, never re-derived from the level — a row-level field the report
      // aggregates is no longer a key, and leaving it here would put one more key in every sleeve
      // than the outer query has. The grain list stays names-only — see `SleeveCalculatedDimensions`.
      const groupingKeyPlans = calculatedMetrics.filter(isCalculatedGroupingKey);
      const calculatedDimensions =
        groupingKeyPlans.length > 0
          ? {
              plans: new Map(groupingKeyPlans.map(metric => [metric.outputName, metric])),
              renderOptions: calculatedFieldRenderOptions,
            }
          : undefined;

      const sleeves = this.createSleeveBuilder().buildAll(sleeveMetrics, context, {
        outputAliasToRoot,
        filters: postJoinFilters,
        resolveColumnType,
        keptGroups,
        formulaSleeves: formulaSleeveInputs,
        calculatedDimensions,
        // A sleeve recomputes its joined metric over the rows the report keeps, so it reproduces
        // the outer WHERE — and a rule on a Calculated Field compares that field's FORMULA. The
        // SAME map, not a second rendering: the two predicates must select the same rows, and
        // `main` carries no column under the field's name for the fallback to have resolved.
        calculatedExpressions: calculatedPredicateExpressions,
      });
      // Push each sleeve's SQL AND its WHERE params together, in WITH-clause order, so the
      // params array stays aligned with placeholder order for positional (Athena) binding.
      for (const s of sleeves) {
        cteBlocks.push(s.sql);
        cteParams.push(...s.params);
      }
      // Recomputed AFTER the sleeve CTEs are pushed so they're part of the WITH clause.
      const withClause = `WITH\n${cteBlocks.join(',\n\n')}`;

      const planByCall = new Map(
        formulaSleeveInputs.map(({ plan }) => [
          `${plan.metricOutputName}\u241F${plan.callIndex}`,
          plan,
        ])
      );
      for (const s of sleeves) {
        if (!s.formulaCall) continue;
        const plan = planByCall.get(
          `${s.formulaCall.metricOutputName}\u241F${s.formulaCall.callIndex}`
        );
        if (!plan || s.pulls.length !== 1) {
          throw new Error(
            `buildBlendedQuery: formula sleeve '${s.cteName}' for metric ` +
              `'${s.formulaCall.metricOutputName}' call ${s.formulaCall.callIndex} has ` +
              `${s.pulls.length} pull(s) and ${plan ? 'a' : 'no'} matching plan — one call is one ` +
              `sleeve is one pull, and the splice has nothing to put in the formula otherwise`
          );
        }
        const spans = formulaReplacements.get(plan.metricOutputName) ?? [];
        spans.push({
          start: plan.call.start,
          end: plan.call.end,
          sql: this.sleevePullExpression(s.cteName, s.pulls[0]),
        });
        formulaReplacements.set(plan.metricOutputName, spans);
      }
      // Checked against the replacements ACTUALLY built, not against the plans: a sleeve lost
      // anywhere between planning and here would otherwise leave its joined reference to be
      // qualified against `main`.
      for (const metric of routableFormulas) {
        this.assertJoinedReferencesRouted(
          metric,
          formulaReplacements.get(metric.outputName) ?? [],
          aliasByJoinedField,
          outputAliasToRoot
        );
      }
      // `calculatedPredicateExpressions` was rendered ABOVE the splice loop, so it holds each
      // filtered formula's PRE-splice text. That is correct only while no filtered field can carry
      // a splice — which D22 guarantees by refusing a filter on a sleeve-routed aggregate-level
      // field. Asserted rather than trusted: if one ever does, the predicate and the projection
      // become two different renderings of one formula, and two renderings that disagree about
      // which rows a metric covers is a wrong number with nothing on screen to say so.
      for (const metric of context.calculatedFilterMetrics ?? []) {
        if (!formulaReplacements.has(metric.outputName)) continue;
        throw new Error(
          `buildBlendedQuery: calculated field '${metric.outputName}' is FILTERED on and also had ` +
            `an aggregate call lifted into a sleeve, but its predicate was rendered before the ` +
            `splice — rebuild the predicate expressions after the splice loop, or the WHERE/HAVING ` +
            `and the SELECT compare two different spellings of one formula`
        );
      }

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
          includeUniqueCount: context.uniqueCount === true,
          primaryKeyColumns: context.primaryKeyColumns,
          timeZoneByColumn: buildTimeZoneMap(context.dateTruncs ?? []),
          typeByColumn: context.columnTypes?.postJoin,
          // Projected through the renderer's own substitution channel. Only a GROUPING KEY pushes
          // its rendered expression into `groupByParts` — which is why the sleeves above are handed
          // exactly those plans, and why the grain assertions counting that array hold either way.
          // Every plan travels here, key or not: the ones that are not still have to be PROJECTED.
          calculatedMetrics: context.calculatedMetrics,
          // The SAME object every sleeve rendered its calculated dimensions with, spread rather
          // than rebuilt: `qualifyColumn`, the replacement spans and the reference resolver.
          ...calculatedFieldRenderOptions,
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
      //
      // A formula sleeve is skipped here: its pull is one operand INSIDE its metric's expression,
      // spliced above, and emitting it here as well would project half a metric under a name no
      // header claims.
      const sleeveSelect = sleeves
        .filter(s => !s.formulaCall)
        .flatMap(s =>
          s.pulls.map(
            p => `${this.sleevePullExpression(s.cteName, p)} AS ${this.quoteIdentifier(p.alias)}`
          )
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
      const where = renderer.renderWhere(
        postJoinFilters,
        qualifyColumn,
        'p',
        resolveColumnType,
        calculatedPredicateExpressions
      );
      // Post-aggregation filters become HAVING, using the SAME qualified aggregate expression the
      // SELECT emits; WHERE skips them above. The split is the rule's carried clause (D21).
      // A calculated field's aggregate travels as the argument the SELECT above already rendered:
      // its name is an outer alias, not a column of `main`, and the declared-type cast lives on
      // that side only (#6732, D18/D19b).
      const having = renderer.renderHaving(
        postJoinFilters,
        qualifyColumn,
        'h',
        resolveColumnType,
        agg.aggregateArgumentByLabel,
        calculatedPredicateExpressions
      );
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
        renderer.buildAggregatedAliasResolver(
          aliasByColumnWithSleeves,
          renderer.buildCalculatedSortExpressions(
            calculatedMetrics,
            calculatedPredicateExpressions,
            context.aggregations ?? [],
            calculatedFieldRenderOptions
          )
        )
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

    // A ROW-LEVEL calculated field does NOT flip the query into the grouped shape (spec §2.1), so
    // this projection is the only place it can appear — and without it the field was absent from
    // the SQL while a header was still published for it (spec §4). The aggregated branch's
    // reference assertion runs here too, over no replacement spans: this path lifts no call into a
    // sleeve, so a joined reference has nowhere to be routed and must be refused rather than
    // qualified against `main`.
    const calculatedSelectItems = renderer
      ? renderer.renderCalculatedSelectItems(calculatedMetrics, calculatedFieldRenderOptions)
      : [];
    for (const metric of routableFormulas) {
      this.assertJoinedReferencesRouted(metric, [], aliasByJoinedField, outputAliasToRoot);
    }

    const selectParts = cteBuilder.buildSelectParts(
      columnSet,
      outputAliasToRoot,
      hiddenOutputAliases
    );
    const selectClause = composePlainSelectBody(
      selectParts.length > 0 ? selectParts.join(',\n  ') : '*',
      calculatedSelectItems
    );

    const body =
      `SELECT\n  ${selectClause}\nFROM ${this.quoteIdentifier('main')}` +
      (joinParts.length > 0 ? '\n' + joinParts.join('\n') : '');

    assertNoHavingRules(postJoinFilters, 'buildBlendedQuery ungrouped query');
    const where = renderer
      ? renderer.renderWhere(
          postJoinFilters,
          qualifyColumn,
          'p',
          resolveColumnType,
          calculatedPredicateExpressions
        )
      : { sql: '', params: [] as SqlParameter[] };
    const orderBy = renderer
      ? renderer.renderOrderBy(
          context.sort ?? [],
          // A calculated field's name is a SELECT alias, never a column of any CTE: the qualifier
          // would emit `main.<name>` — an unrecognized name on every dialect.
          renderer.buildPlainSelectAliasResolver(
            calculatedMetrics,
            qualifyColumn,
            // The ungrouped blended path has no report aggregations, same as a dialect's plain
            // branch.
            renderer.buildCalculatedSortExpressions(
              calculatedMetrics,
              calculatedPredicateExpressions,
              [],
              calculatedFieldRenderOptions
            )
          )
        )
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
