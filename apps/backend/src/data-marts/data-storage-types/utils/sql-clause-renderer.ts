import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { SortRule } from '../../dto/schemas/sort-config.schema';
import { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import {
  NUMERIC_ARGUMENT_FUNCTIONS,
  ReportAggregateFunction,
} from '../../dto/schemas/aggregate-function.schema';
import {
  DateTruncRule,
  DateTruncUnit,
  DATE_TRUNC_UNITS,
  IANA_TIME_ZONE_PATTERN,
} from '../../dto/schemas/date-trunc-config.schema';
import {
  UNIQUE_COUNT_LABEL,
  aggregatedColumnLabel,
  aggregationFunctionsForColumn,
} from '../../dto/schemas/aggregation-labels';
import { isFloatingPointType, isIntegerType } from '../../dto/schemas/field-type-category';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { effectiveComparisonType } from '../field-aggregation';
import { GroupRestriction } from '../../dto/domain/group-restriction';
import { isHavingFilterRule, isWhereFilterRule } from '../../dto/domain/filter-clause';
import { buildDateTruncUnitMap, buildTimeZoneMap } from './date-trunc-maps.utils';
import {
  KEPT_GROUPS_CTE,
  buildKeptGroupsJoinPairs,
  buildKeptGroupsProjection,
} from './kept-groups.utils';
import { naryTextConcat, renderPrimaryKeyCountRef } from './primary-key-identity.utils';
import {
  FormulaCycleError,
  FormulaExpansionTooLargeError,
  FormulaExpansionGuard,
  FormulaReference,
  FormulaReferenceSyntaxError,
  FormulaSpanReplacement,
  renderFormulaWithReplacements,
} from '../../calculated-fields/formula-reference';
import type { FormulaOwnerAnalysis } from '../../calculated-fields/formula-owner-plan';
import { isLiveReference } from '../../calculated-fields/formula-live-reference';
import { isAggregateLevel, type CalculatedFieldLevel } from '../../calculated-fields/formula-level';
import { isCalculatedGroupingKey } from '../../calculated-fields/calculated-plan-grain';
import { scanSql, type SqlToken } from '../../calculated-fields/sql-token-scanner';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';

// Array order MUST match placeholder order in the SQL: positional dialects
// (Athena `?`) bind by position and ignore `name`.
export interface SqlParameter {
  name: string;
  value: string | number | boolean | null;
}

export interface RenderedClause {
  sql: string;
  params: SqlParameter[];
}

/**
 * Returns the SQL fragment for a column reference — fully quoted and, when
 * needed, prefixed with a CTE alias. The renderer cannot derive the prefix
 * from the column name alone, so the caller supplies one.
 */
export type ColumnRefResolver = (column: string) => string;

/**
 * Resolves the storage field type for a filter rule's column. Positional dialects
 * (Athena) use it to cast date/time placeholders so a varchar literal is not
 * compared against a DATE/TIMESTAMP column. Returns undefined when unknown — the
 * renderer then emits a plain placeholder.
 *
 * A Calculated Field has no warehouse column, so it answers the analyst's DECLARED type instead —
 * through this same seat rather than a parallel one (#6732, D25). See {@link buildFilterTypeResolver}.
 */
export type ColumnTypeResolver = (rule: FilterRule) => string | undefined;

/**
 * The ONE type a filter path resolves a rule against (#6732, D25): an ordinary column's storage
 * type, and a Calculated Field's DECLARED type, from the same seat.
 *
 * `columnTypes` can never hold a Calculated Field — there is no warehouse column to read one from —
 * so before this the resolver answered `undefined` for it and the VALUE's JS type decided the
 * comparison. Measured: `= 10` and `= '10'` over one field flipped BigQuery and Athena between a
 * hard error and the right answer (spec §1.4). A second, parallel resolver would have to reach the
 * same six call sites and could disagree with this one at any of them, so the declaration travels
 * through this one.
 *
 * `effectiveComparisonType` still widens a rule that carries a FUNCTION: that rule compares the
 * AGGREGATE's value, and a report may aggregate a row-level calculated field like any column.
 *
 * Answers `undefined` when there is nothing to resolve from, so "this dialect has no types" stays a
 * decision rather than a resolver that always answers nothing.
 */
export function buildFilterTypeResolver(
  columnTypes: ReadonlyMap<string, string> | undefined,
  calculatedMetrics: readonly CalculatedMetricPlan[] | undefined,
  storageType: DataStorageType
): ColumnTypeResolver | undefined {
  const declaredTypes = declaredTypeByCalculatedField(calculatedMetrics);
  if (!columnTypes && declaredTypes.size === 0) return undefined;
  return rule =>
    effectiveComparisonType(
      declaredTypes.get(rule.column) ?? columnTypes?.get(rule.column),
      rule,
      storageType
    );
}

/**
 * One Calculated Field's predicate LEFT-HAND SIDE, and the type a comparison on it imposes
 * (#6732, D23/D25). Built once per field by `buildCalculatedPredicateExpressions` and read per
 * RULE, because whether the declaration applies is a property of the OPERATOR, not of the field.
 *
 * The two travel together rather than as an expression map beside a type map: they are one
 * decision, and the whole point is that the expression and the value cannot be cast to different
 * targets. Nothing downstream may cast `expression` on its own.
 */
export interface CalculatedPredicateOperand {
  /** The substituted formula, parenthesised. Never cast — see {@link COMPARISON_OPERATORS}. */
  expression: string;
  /** The declared type this field's comparisons impose, or `undefined` when they impose none. */
  castType?: string;
}

/**
 * The operators whose predicate compares a VALUE against the field, and therefore the only ones a
 * declared type is imposed on (#6732, D23 — "a COMPARISON imposes the declared type").
 *
 * Everything else is excluded because the cast cannot help it and can only hurt:
 * - `is_null` / `is_not_null` have no value to coerce, and casting the expression would make ONE
 *   unparseable row fail the whole query where it used to return rows — a new failure mode, of a
 *   shape no probe has measured, on a predicate that never looks at the value at all.
 * - the text matchers (`contains`, `starts_with`, `regex`, `is_empty`, …) are not numeric
 *   comparisons; the validator restricts them to string categories, and a numeric target inside
 *   `STRPOS`/`REGEXP_CONTAINS` buys nothing.
 * - `is_true` / `is_false` compare against a boolean literal, which no numeric declaration reaches.
 * - `relative_date` compares against `CURRENT_DATE()` arithmetic this renderer inlines, and a date
 *   declaration has no cast target on any of the five dialects anyway (D24 leaves dates as
 *   measured).
 */
const COMPARISON_OPERATORS: ReadonlySet<FilterRule['operator']> = new Set([
  'eq',
  'neq',
  'gt',
  'lt',
  'gte',
  'lte',
  'between',
  'in',
  'not_in',
]);

/**
 * Each Calculated Field's declared type by output name — the lookup {@link buildFilterTypeResolver}
 * and the blended filter partition both read, so the two cannot answer one field differently.
 */
export function declaredTypeByCalculatedField(
  ...groups: readonly (readonly CalculatedMetricPlan[] | undefined)[]
): ReadonlyMap<string, string> {
  const types = new Map<string, string>();
  for (const group of groups) {
    for (const metric of group ?? []) types.set(metric.outputName, metric.type);
  }
  return types;
}

/**
 * A calculated metric selected in this query. `formula` is the STORED form (dialect SQL with
 * `{{ref}}` tags); `renderAggregatedSelect` substitutes each tag and projects the result under
 * `outputName`. `type` is the analyst's declared field type — there is no warehouse column to
 * derive one from.
 */
export interface CalculatedMetricPlan {
  outputName: string;
  formula: string;
  type: string;
  /**
   * Whether the FORMULA aggregates (#6732) — a property of the formula alone, never of what a
   * report does with the field. It decides whether selecting the field makes the query aggregated
   * at all, and whether the field may be totalled.
   *
   * It does NOT decide whether the field is a grouping key: a report may aggregate a row-level
   * field, which stays row-level and stops being a key (spec §2, slice 3). Ask
   * `isCalculatedGroupingKey` for that — never this field on its own.
   *
   * REQUIRED, unlike everything else optional here, because the two readings differ by a GROUP BY
   * rather than by an error — a row-level field defaulted to metric returns a plausible wrong
   * number. Build it with `calculatedFieldLevelOf`, never by copying the schema field's own `level`
   * through: that one is optional on the wire, and where an absent level reads as `metric` belongs
   * in one place.
   */
  level: CalculatedFieldLevel;
  /**
   * Whether the REPORT applies an aggregation rule to this field (#6732, spec §2.2) — the other
   * half of the grain question, decided once by `partitionCalculatedPlans` at the two plan
   * factories and carried here so no site downstream re-derives it from `level`.
   *
   * Absent means no rule names the field, which is the truth for every plan built before a report
   * could aggregate one. Read it through `isCalculatedGroupingKey`, which combines it with `level`
   * — on its own it answers only half.
   */
  isAggregatedByReport?: boolean;
  /**
   * Which Data Mart each aggregate call of `formula` reads from, and what could not be routed
   * (#6732). Read by the BLENDED builder only: it lifts every joined call into its own metric
   * sleeve, because the blend aggregates each joined source by its join key before joining it in.
   * The flat path has no joined source to route to and ignores this.
   *
   * Absent means "not analysed", NOT "everything is main-owner": the blended builder refuses a
   * formula that names a joined source without it, rather than qualifying that name against `main`.
   */
  formulaOwnership?: FormulaOwnerAnalysis;
  /**
   * The analyst's display label for the metric (the schema field's `alias`), and its description.
   * Neither reaches the SQL — a metric always projects under `outputName` — but both travel here
   * because this plan is the ONLY header source a calculated metric has: it is absent from the
   * native headers (no warehouse column) and from `aggregationConfig` (it is already an
   * aggregate). Without them, a metric aliased "CTR, %" is the one column in its own report
   * whose header still reads `ctr` — in the Google Sheet, in Looker Studio's field label, in
   * MCP's `displayName`, and as an HTTP Data `title: undefined`.
   */
  alias?: string;
  description?: string;
  /**
   * The plans this formula's own `{{ref}}` tags need SUBSTITUTED into it — the transitive closure
   * of the calculated fields it reads, FLAT and de-duplicated (#6732, D15). Built by the two plan
   * factories through `calculatedDependencyPlans`.
   *
   * A dependency is NOT a column. It lives inside the plan that needs it rather than beside it in
   * the report's `calculatedMetrics` array, because that array is what every downstream surface
   * derives a projection and a HEADER from, and what the Totals restriction reads its GROUP BY keys
   * off — a report selecting `roas` must not gain `revenue` and `cost` as columns nobody asked for.
   * Carried here, a dependency cannot become either by a filter being forgotten somewhere.
   *
   * Flat rather than nested so that a cyclic schema cannot build a cyclic object graph out of plans
   * that travel through DTOs and a cache; every level of the expansion looks names up in this same
   * list, and the field that CLOSES a loop is deliberately kept in it so the renderer's guard can
   * refuse it by name instead of the reference falling through to a column that does not exist.
   */
  dependencies?: readonly CalculatedMetricPlan[];
}

/**
 * The channels one calculated field's references become SQL through. Named and exported because
 * `renderRowLevelDimensionExpression` is called from OUTSIDE this class hierarchy (the blended
 * builder's metric sleeve), and it must hand over the SAME channels the outer SELECT was given —
 * these are `renderAggregatedSelect`'s own option names, so one object serves both calls and the
 * two renderings cannot drift.
 */
export interface CalculatedFieldRenderOptions {
  qualifyColumn?: ColumnRefResolver;
  calculatedMetricReplacements?: ReadonlyMap<string, readonly FormulaSpanReplacement[]>;
  resolveCalculatedMetricReference?: (ref: FormulaReference) => string;
}

/**
 * Whether a set of calculated fields forces the AGGREGATED query shape (#6732).
 *
 * Only an aggregating formula does. A row-level one is a dimension: making it flip the shape
 * would turn a plain projection into an implicit DISTINCT over the report's other columns —
 * fewer rows, no error, no signal. The level rule itself is `isAggregateLevel`, shared with
 * `isAggregateCalculatedField`; every builder calls this instead of keeping its own copy.
 *
 * Every caller passes the SELECTED metrics AND the FILTERED ones, because a predicate on an
 * aggregate-level field forces the shape exactly as selecting one does: the field is the only
 * thing that would have made the query aggregated, so a report that filters on one without
 * selecting it would otherwise take the plain branch, where `assertNoHavingRules` refuses the
 * homeless predicate — a 500 for a report the analyst is entitled to.
 */
export function hasAggregateCalculatedMetric(
  metrics: readonly CalculatedMetricPlan[] | undefined
): boolean {
  return (metrics ?? []).some(metric => isAggregateLevel(metric.level));
}

// Matches BigQuery named-parameter rules — fail fast instead of waiting for BQ to reject it.
const PARAM_PREFIX_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The plain (non-aggregated) SELECT body with each calculated field appended as its own
 * projected expression (#6732).
 *
 * `*` is DROPPED once there is a calculated item: a caller that supplied a plan asked for a
 * named projection, and `SELECT *, <expr> AS f` would widen the report to every warehouse
 * column — while the aggregated sibling, handed the same empty column list, projects the field
 * alone. Shared so the five dialect builders cannot each answer that differently.
 */
export function composePlainSelectBody(
  selectList: string,
  calculatedItems: readonly string[]
): string {
  if (calculatedItems.length === 0) return selectList;
  return [...(selectList === '*' ? [] : [selectList]), ...calculatedItems].join(',\n  ');
}

/**
 * Refuses a HAVING-routed rule on a query shape that emits no HAVING clause (#6732, D21).
 *
 * Every dialect's PLAIN branch — and the blended ungrouped path — renders WHERE, ORDER BY and
 * LIMIT and never calls `renderHaving`, so a rule routed to HAVING there is applied in NEITHER
 * clause: the report silently returns rows it was told to drop. That shape is reachable for a
 * filter on an aggregate-level Calculated Field the report does NOT select — the field is the only
 * thing that would have made the query aggregated, so leaving it out of the projection leaves the
 * predicate homeless. Before the clause was carried this same report emitted an aggregate in
 * `WHERE` and failed loudly at the warehouse; this keeps it loud.
 *
 * The type system cannot reach it: `clause` is a property of the RULE, not of the query shape, and
 * the branch is chosen after the filters are rendered.
 */
export function assertNoHavingRules(filters: readonly FilterRule[], queryShape: string): void {
  const routed = filters.filter(isHavingFilterRule);
  if (routed.length === 0) return;
  throw new Error(
    `${queryShape}: [${routed.map(rule => rule.column).join(', ')}] are routed to HAVING, but ` +
      `this query has no GROUP BY and emits no HAVING — the predicate would apply in neither ` +
      `clause and the report would keep rows it was told to drop`
  );
}

/**
 * Assembles a `SELECT … FROM …` head with the column list one-per-line at 2-space
 * indent — the same shape the blended builder and CTE blocks already use, so every
 * dialect's flat query formats identically. `selectBody` is either `*` (kept inline)
 * or a column list already joined with `,\n  ` (e.g. from `renderAggregatedSelect`
 * or a dialect's `,\n  `-joined projection).
 */
export function composeSelectFromClause(selectBody: string, fromClause: string): string {
  // An empty body emitted `SELECT\n  \nFROM …` — a syntax error on all five warehouses, produced
  // on every run and every Generated-SQL preview. It is reachable: a report with no explicit
  // projection plus a filter on an aggregate-level Calculated Field takes the AGGREGATED branch
  // with `columns: []`, and `renderAggregatedSelect` then has nothing to project.
  //
  // Thrown rather than defaulted, because both defaults are wrong. `*` under a GROUP BY is a
  // different wrong answer, and dropping the filter silently discards what the analyst asked for.
  // The validator refuses this shape with a 400 naming the field; this is the backstop for every
  // path that reaches a renderer without passing it.
  if (selectBody.trim() === '') {
    throw new Error(
      'Refusing to emit a query with an empty SELECT list: the report projects no column, and ' +
        'nothing else in the query supplies one.'
    );
  }
  return selectBody === '*'
    ? `SELECT *\nFROM ${fromClause}`
    : `SELECT\n  ${selectBody}\nFROM ${fromClause}`;
}

export abstract class SqlClauseRenderer {
  protected abstract quoteIdentifier(name: string): string;
  protected abstract renderFilterFragment(
    rule: FilterRule,
    paramName: string,
    columnRef: string,
    columnType?: string,
    /**
     * The SQL type this comparison imposes on the VALUE (#6732, D25) — set only when `columnRef` is
     * a Calculated Field's formula that a COMPARISON operator is being applied to, and then it is
     * the SAME target `columnRef` is already cast to, because both come from one `castType` in
     * `imposeDeclaredType`. Every value slot the operator emits must carry it: a range bound or a
     * list member that skipped it is compared under a different type from the one beside it.
     * `undefined` leaves the dialect's own value handling exactly as it is.
     */
    valueCastType?: string
  ): RenderedClause;

  /**
   * The SQL type a COMPARISON imposes on a Calculated Field's declared type (#6732, D23) — the
   * predicate-side analogue of `renderAggregateArgument`, following that rule exactly.
   *
   * Floating-point and exact-decimal declarations only: the INTEGER family is excluded (D19b)
   * because casting one introduces the per-row conversion the cast exists to remove, and the
   * dialects disagree on its direction (Spark truncates where the other four round). `undefined`
   * whenever the dialect states no target — every non-numeric declaration — so the SQL is then
   * byte-identical to what it was, which is what keeps the live-measured numbers still.
   */
  private comparisonCastType(declaredType: string | undefined): string | undefined {
    if (declaredType === undefined || isIntegerType(declaredType)) return undefined;
    return this.castTypeForDeclaredType(declaredType);
  }

  /**
   * One rule's left-hand side and the type its value must carry, from the operand this field was
   * rendered as (#6732, D23/D25).
   *
   * ONE `castType` feeds both, so the expression and the value cannot name different targets — and
   * the value's cast is unreachable without the expression's by construction, not by discipline.
   * A non-comparison operator gets the bare expression and no target at all
   * (see {@link COMPARISON_OPERATORS}).
   */
  private imposeDeclaredType(
    operand: CalculatedPredicateOperand,
    operator: FilterRule['operator']
  ): { lhs: string; valueCastType?: string } {
    const castType = COMPARISON_OPERATORS.has(operator) ? operand.castType : undefined;
    return castType
      ? { lhs: `CAST(${operand.expression} AS ${castType})`, valueCastType: castType }
      : { lhs: operand.expression };
  }

  private resolverOrFallback(qualifyColumn: ColumnRefResolver | undefined): ColumnRefResolver {
    return qualifyColumn ?? (c => this.quoteIdentifier(c));
  }

  /**
   * A Calculated Field's formula as the LEFT-HAND SIDE of a predicate, per output name (#6732).
   *
   * The field's name is a SELECT alias with no warehouse column behind it, so the ordinary
   * `qualifyColumn(rule.column)` left-hand side names something that does not exist. The published
   * reason the filter was refused said a predicate could not resolve that alias — true, and beside
   * the point: a predicate's LHS is already an opaque SQL string here, which is why `renderHaving`
   * emits `SUM("amount")` rather than the alias. `HAVING (<expr>) > <value>` was measured compiling
   * and returning the correct group on all five storages, identically.
   *
   * PARENTHESISED, and that is not cosmetic: a formula body is arbitrary analyst SQL, and Redshift
   * binds `=` tighter than `||`, so a bare `a || b = 'x'` parses as `a || (b = 'x')` and the
   * warehouse rejects the predicate. `renderAggregateArgument` parenthesises for the same reason.
   *
   * One map serves WHERE and HAVING, because which clause a field's predicate lands in is the
   * field's LEVEL (D21) and not a property of its expression — the same formula is the LHS either
   * way. It is deliberately NOT the expression the SELECT emitted: that one is rendered with the
   * PROJECTION qualifier, while a predicate carries the predicate qualifier, and both are correct
   * (`renderAggregatedSelect` says the same of an ordinary column's two spellings).
   *
   * The expression here is NEVER cast. The declared type each field's comparisons impose travels
   * beside it as `castType` (#6732, D23), and `imposeDeclaredType` applies it per RULE — because
   * whether it applies at all is a property of the OPERATOR, not of the field: `IS NULL` looks at
   * no value, and casting it would make one unparseable row fail a whole query that used to return
   * rows.
   *
   * The target is read off the PLAN rather than off the filter path's type resolver deliberately.
   * They are provably the same thing here — `effectiveComparisonType` returns the declared type
   * unchanged for a function-less rule, which is every rule that reaches this map — but reading the
   * plan means the imposition cannot depend on a caller having wired the resolver, and losing it
   * is the measured wrong SUBSET: Redshift's `>` over a FLOAT-declared text formula is
   * LEXICOGRAPHIC and returned `9` where `9, 10, 100` is correct, no error and no NULL. The
   * resolver still decides the DATE-literal cast four dialects emit, which is a different question
   * and D24's (see the `columnType` argument of `renderFilterFragment`).
   */
  buildCalculatedPredicateExpressions(
    metrics: readonly CalculatedMetricPlan[] | undefined,
    opts: CalculatedFieldRenderOptions = {}
  ): ReadonlyMap<string, CalculatedPredicateOperand> {
    const operands = new Map<string, CalculatedPredicateOperand>();
    for (const metric of metrics ?? []) {
      operands.set(metric.outputName, {
        expression: `(${this.renderCalculatedFieldExpression(metric, opts)})`,
        castType: this.comparisonCastType(metric.type),
      });
    }
    return operands;
  }

  /**
   * The ARGUMENT each of `rules`' aggregate calls over a Calculated Field is given, keyed by
   * `aggregatedColumnLabel(column, fn)` — `renderAggregatedSelect`'s `aggregateArgumentByLabel`,
   * for the one caller that renders a HAVING WITHOUT the projection that would have produced it.
   *
   * That caller is the Totals group restriction: it re-runs the report's grouping in a subquery
   * whose SELECT carries the dimension tuple alone, so no projection there ever renders
   * `SUM(<formula>)` and there is no map to pass on. Rendered through the SAME two seats the
   * projection uses (`renderCalculatedFieldExpression` then `renderAggregateArgument`), so D18's
   * declared-type cast is applied by one rule rather than by two agreeing ones.
   *
   * Deliberately NOT `buildCalculatedPredicateExpressions`' map, though a rule could be answered
   * from it: those operands are cast per OPERATOR (D23) where an aggregate argument is cast per
   * FUNCTION (D18), so `MIN` would gain a cast the projection does not have — a third spelling of
   * one predicate, which is the drift this seat exists to end.
   */
  buildCalculatedAggregateArguments(
    metrics: readonly CalculatedMetricPlan[] | undefined,
    rules: readonly FilterRule[],
    opts: CalculatedFieldRenderOptions = {}
  ): ReadonlyMap<string, string> {
    const planByName = new Map((metrics ?? []).map(metric => [metric.outputName, metric]));
    const argumentByLabel = new Map<string, string>();
    for (const rule of rules) {
      const fn = rule.function;
      if (!fn) continue;
      const metric = planByName.get(rule.column);
      if (!metric) continue;
      argumentByLabel.set(
        aggregatedColumnLabel(rule.column, fn),
        this.renderAggregateArgument(
          fn,
          this.renderCalculatedFieldExpression(metric, opts),
          metric.type
        )
      );
    }
    return argumentByLabel;
  }

  renderWhere(
    filters: FilterRule[],
    qualifyColumn?: ColumnRefResolver,
    paramPrefix = 'p',
    resolveColumnType?: ColumnTypeResolver,
    calculatedExpressions?: ReadonlyMap<string, CalculatedPredicateOperand>
  ): RenderedClause {
    // Post-aggregation rules are handled by renderHaving, so WHERE skips them; callers pass the
    // full filter list to both. Which clause a rule belongs in is decided once and carried on it
    // (D21) — never re-derived from `rule.function`, which cannot express an aggregate-level
    // Calculated Field's filter.
    const whereRules = filters.filter(isWhereFilterRule);
    if (!whereRules.length) return { sql: '', params: [] };
    if (!PARAM_PREFIX_PATTERN.test(paramPrefix)) {
      throw new Error(
        `renderWhere: invalid paramPrefix '${paramPrefix}' — must match ${PARAM_PREFIX_PATTERN.source}`
      );
    }
    const resolve = this.resolverOrFallback(qualifyColumn);
    const fragments: string[] = [];
    const params: SqlParameter[] = [];
    let nextIndex = 0;
    for (const rule of whereRules) {
      const paramName = `${paramPrefix}${nextIndex}`;
      // A Calculated Field's predicate compares its FORMULA, and a COMPARISON imposes the
      // declaration on both sides of it (#6732, D23/D25). An ordinary column is untouched: its
      // value's handling is the dialect's own.
      const calculated = calculatedExpressions?.get(rule.column);
      const imposed = calculated && this.imposeDeclaredType(calculated, rule.operator);
      const out = this.renderFilterFragment(
        rule,
        paramName,
        imposed?.lhs ?? resolve(rule.column),
        resolveColumnType?.(rule),
        imposed?.valueCastType
      );
      this.validateFragment(out);
      fragments.push(out.sql);
      params.push(...out.params);
      nextIndex += out.params.length;
    }
    return { sql: `\nWHERE ${fragments.join('\n  AND ')}`, params };
  }

  /**
   * Renders the HAVING clause for post-aggregation filters. Each rule carries the
   * `function` that names the aggregate to compare, so the left-hand side is the SAME
   * aggregate EXPRESSION the SELECT emits (e.g. `SUM(\`amount\`) > @h0`) — NOT the output
   * alias, which several dialects forbid in HAVING. The comparison/operator/param logic
   * is shared with WHERE via `renderFilterFragment`. `qualifyColumn` MUST match the one
   * passed to `renderAggregatedSelect` so the aggregate argument is qualified identically
   * (otherwise `SUM(main.col)` in SELECT vs `SUM(col)` in HAVING is a different expression).
   *
   * `aggregateArgumentByLabel` is `renderAggregatedSelect`'s own `aggregateArgumentByLabel` —
   * the arguments it ALREADY emitted for a report-aggregated Calculated Field, keyed by
   * `aggregatedColumnLabel(column, fn)`. A rule found there compares that exact string, so the
   * predicate and the projection are one derivation rather than two (#6732, D18/D19b): the
   * declared-type CAST lives on the projection side only, and re-deriving it here is what made a
   * Redshift report print `1.75` and then drop the group for failing `> 1.5`. Absent, or missing
   * the rule's label — an ordinary column, which `renderAggregatedSelect` deliberately spells with
   * a different qualifier — the LHS falls back to `qualifyColumn` as before.
   *
   * `calculatedExpressions` is `buildCalculatedPredicateExpressions`' map, and it answers the OTHER
   * shape of post-aggregation rule: a filter on an AGGREGATE-level Calculated Field, which carries
   * no `function` and by `AGGREGATION_ON_CALCULATED_METRIC` never can, so its left-hand side is the
   * field's own formula (#6732 spec §2). A rule carrying a function is unaffected — a row-level
   * field the report AGGREGATES keeps comparing the argument the SELECT already emitted, cast and
   * all (D18), and reading the bare expression there would compare the uncast value against a
   * printed cast one.
   */
  renderHaving(
    filters: FilterRule[],
    qualifyColumn?: ColumnRefResolver,
    paramPrefix = 'h',
    resolveColumnType?: ColumnTypeResolver,
    aggregateArgumentByLabel?: ReadonlyMap<string, string>,
    calculatedExpressions?: ReadonlyMap<string, CalculatedPredicateOperand>
  ): RenderedClause {
    // The clause comes off the rule (D21); the rest are WHERE (renderWhere).
    const havingRules = filters.filter(isHavingFilterRule);
    if (!havingRules.length) return { sql: '', params: [] };
    if (!PARAM_PREFIX_PATTERN.test(paramPrefix)) {
      throw new Error(
        `renderHaving: invalid paramPrefix '${paramPrefix}' — must match ${PARAM_PREFIX_PATTERN.source}`
      );
    }
    const resolve = this.resolverOrFallback(qualifyColumn);
    const fragments: string[] = [];
    const params: SqlParameter[] = [];
    let nextIndex = 0;
    for (const rule of havingRules) {
      const fn = rule.function;
      const paramName = `${paramPrefix}${nextIndex}`;
      // A rule routed here with no `function` is an AGGREGATE-level Calculated Field's filter
      // (#6732): its left-hand side is the field's own formula, and the plan carrying it must have
      // reached this call. Refusing when it has not — rather than skipping the rule — is what keeps
      // the failure loud: skipped, the predicate applies in NEITHER clause and the report keeps
      // rows it was told to drop, with nothing to say so.
      let lhs: string;
      // Set only on the calculated branch: a rule carrying a function compares the aggregate the
      // SELECT already printed, cast and all (D18), so imposing a second target on its value would
      // be a different comparison from the one beside it in the projection.
      let valueCastType: string | undefined;
      if (fn) {
        const label = aggregatedColumnLabel(rule.column, fn);
        const argument = aggregateArgumentByLabel?.get(label);
        // The field is known to be calculated (a filter named it, so the predicate map holds it)
        // and no argument reached this call: `resolve` would emit the field's NAME, which is a
        // SELECT alias no warehouse has a column for. Loud, because the seat that used to fall
        // through here is the Totals restriction, whose failure is swallowed.
        if (argument === undefined && calculatedExpressions?.has(rule.column)) {
          throw new Error(
            `renderHaving: filter on '${label}' aggregates a calculated field, but no aggregate ` +
              `argument for it reached this renderer — its left-hand side is the argument the ` +
              `projection was given (D18), and the field's own name resolves to nothing`
          );
        }
        lhs = this.renderAggregateExpression(fn, argument ?? resolve(rule.column));
      } else {
        const operand = calculatedExpressions?.get(rule.column);
        if (!operand) {
          throw new Error(
            `renderHaving: filter on '${rule.column}' is routed to HAVING but carries no ` +
              `function — a calculated field's HAVING needs its formula as the left-hand side, ` +
              `and no plan for it reached this renderer`
          );
        }
        ({ lhs, valueCastType } = this.imposeDeclaredType(operand, rule.operator));
      }
      const out = this.renderFilterFragment(
        rule,
        paramName,
        lhs,
        resolveColumnType?.(rule),
        valueCastType
      );
      this.validateFragment(out);
      fragments.push(out.sql);
      params.push(...out.params);
      nextIndex += out.params.length;
    }
    return { sql: `\nHAVING ${fragments.join('\n  AND ')}`, params };
  }

  /**
   * Renders the SELECT list and GROUP BY for an aggregated query. Group-by is
   * implied: any projected `column` without an aggregation rule becomes a grouping
   * key, in projection order. A column may carry MORE THAN ONE aggregation function —
   * each emits its own `FN(col) AS "<col> | TOKEN"` select item, in rule
   * order — the FN argument stays the raw column, only the output alias carries the
   * suffix. A dimension that carries a date-trunc unit renders as
   * `DATE_TRUNC(col) AS "col"` and groups by that same truncated expression (not the
   * bare column). Returns empty `groupBySql` when every projected column is aggregated.
   *
   * `aliasByColumn` maps each projected column to its QUOTED output alias (metric →
   * its FIRST function's quoted suffixed label, dimension incl. date-trunc and a ROW-LEVEL
   * calculated field → quoted column/output name). Feed it to `buildAggregatedAliasResolver` so
   * ORDER BY references the output alias — a bare aggregated column is not in GROUP BY and would
   * be a SQL error. An ORDER BY on a multi-aggregated column therefore resolves to its first
   * aggregation.
   *
   * `opts.qualifyColumn` lets the blended builder qualify the FN argument / dimension
   * expression / GROUP BY key with a CTE alias (e.g. `main.\`col\``). When set, a plain
   * dimension renders with an explicit `AS <unqualified alias>` so the output column
   * name equals the header name; when absent (the flat path) it renders as just the
   * quoted column with no alias. The output alias is always unqualified in both modes.
   */
  /**
   * The SQL type keyword used in CAST(<col> AS <type>) inside the UNIQUE COUNT
   * composite-PK tuple expression — BigQuery/Databricks say STRING, Snowflake/Redshift/Athena say
   * VARCHAR. Abstract on purpose: no keyword is right everywhere, and a default would let a new
   * dialect pass every single-key test (those never cast) and fail in the warehouse on its first
   * composite key. Public so the reflective test below can assert every dialect declares its own.
   */
  public abstract textCastType(): string;

  /**
   * The SQL type name this dialect accepts in `CAST(<expr> AS <type>)` for a field the analyst
   * DECLARED as `declaredType` — or `undefined` when this dialect states none, which means the
   * caller emits no cast rather than guess a spelling (#6732, D19).
   *
   * The declaration is never validated against the formula (D3), so it arrives as a name from this
   * dialect's own field-type vocabulary, and that vocabulary is not always SQL: BigQuery declares
   * `FLOAT` where GoogleSQL says `FLOAT64`, and the live probe's verbatim substitution was answered
   * `Type not found: FLOAT at [2:51]`. Athena declares `FLOAT` for a type its own queries have no
   * name for.
   *
   * One rule spans the dialects, and the dialect specs pin it: a target may WIDEN a declared float
   * but never narrows one. The 32-bit declarations (Athena/Databricks `FLOAT`, Athena/Redshift
   * `REAL`) therefore map to that dialect's 64-bit float. Today there is no cast at all, so an
   * expression like `revenue / clicks` already computes in 64 bits; a faithful 32-bit target would
   * round a correct number to ~7 significant digits with nothing to show for it. The integer and
   * exact types stay faithful instead — those declare a GRAIN the analyst chose, which §3 defends
   * on purpose, while 32-bit-ness is a storage width nobody asked for.
   *
   * Abstract with no default, exactly as `textCastType` above and for the same reason: each
   * vocabulary is its own, so no shared table can hold this, and a default would let a new dialect
   * pass every test here and then be refused by the warehouse. Public so the reflective test can
   * assert every dialect declares its own.
   *
   * NUMERIC vocabulary only, deliberately. The one caller casts where the aggregation does
   * arithmetic — `SUM`, `AVG`, the percentiles (D18) — and those are offered for numeric types
   * alone. A date spelling here would hand a caller the cast D16 refuses on measured evidence:
   * before `DATE_TRUNC` it turns a loud Redshift error into the wrong month.
   */
  public abstract castTypeForDeclaredType(declaredType: string): string | undefined;

  /**
   * How this warehouse spells string concatenation. Read by the flat Unique Count below and
   * nowhere else — the blended path carries a row identity as SEPARATE TUPLE SLOTS and never
   * reduces a key to one text scalar, which is why `BlendedSqlDialect` deliberately exposes
   * neither this nor `textCastType`. Redshift's CONCAT takes exactly two arguments and overrides
   * this with a `||` chain.
   */
  public textConcat(parts: readonly string[]): string {
    return naryTextConcat(parts);
  }

  /**
   * Renders `COUNT(DISTINCT <pk-tuple>)` for the Unique Count metric, delegating the
   * tuple/NULL-guard construction to the dialect-free primary-key-identity module so
   * every dialect shares one definition of "what counts as the same row".
   */
  protected renderCountDistinctPrimaryKey(
    pkColumns: string[],
    qualify?: ColumnRefResolver
  ): string {
    const ref = (col: string): string => (qualify ? qualify(col) : this.quoteIdentifier(col));
    return `COUNT(DISTINCT ${renderPrimaryKeyCountRef(
      pkColumns.map(ref),
      this.textCastType(),
      parts => this.textConcat(parts)
    )})`;
  }

  renderAggregatedSelect(
    columns: string[],
    aggregations: AggregationRule[],
    dateTruncByColumn?: ReadonlyMap<string, DateTruncUnit>,
    opts?: {
      includeUniqueCount?: boolean;
      primaryKeyColumns?: string[];
      qualifyColumn?: ColumnRefResolver;
      // column → validated IANA time zone for date-trunc rules that carry one.
      timeZoneByColumn?: ReadonlyMap<string, string>;
      // column → storage field type, so a dialect can render date-trunc type-aware
      // (e.g. BigQuery must treat a tz-naive DATETIME differently from a TIMESTAMP).
      typeByColumn?: ReadonlyMap<string, string>;
      // Calculated fields selected alongside `columns`. Each renders in the outer SELECT via its
      // stored formula. Only a GROUPING KEY (`isCalculatedGroupingKey`) groups by its own rendered
      // expression, appended AFTER every column key; an AGGREGATING one is projected alone, and a
      // row-level one the report aggregates renders through `aggregations` like any other metric.
      calculatedMetrics?: readonly CalculatedMetricPlan[];
      // Per metric `outputName`, spans of its STORED formula that are already rendered as SQL
      // elsewhere and must be swapped in verbatim — a joined aggregate call replaced by its metric
      // sleeve's pull (#6732). References inside a replaced span are not resolved here; the sleeve
      // resolved them against its own owner.
      calculatedMetricReplacements?: ReadonlyMap<string, readonly FormulaSpanReplacement[]>;
      // How ONE reference of a metric's formula becomes SQL. Defaults to `qualifyColumn` over the
      // reference's field name — right for a main-owner reference, and all this renderer can
      // express on its own. The blended builder supplies one that also resolves a JOINED reference
      // through its unified blended name, since it alone knows the join tree.
      resolveCalculatedMetricReference?: (ref: FormulaReference) => string;
    }
  ): {
    selectSql: string;
    groupBySql: string;
    aliasByColumn: ReadonlyMap<string, string>;
    // The individual GROUP BY key expressions, exactly as emitted. Returned so a caller can
    // ASSERT that an expression it built elsewhere (a metric sleeve's projected dimension,
    // ) is byte-identical to the outer grouping key it must join back on, instead of
    // trusting that both derivations stay in step.
    groupByParts: readonly string[];
    /**
     * The ARGUMENT each aggregate call over a report-aggregated Calculated Field was given —
     * the substituted formula, parenthesised, and cast to the declared type where the function
     * does arithmetic (#6732, D18/D19b) — keyed by `aggregatedColumnLabel(outputName, fn)`.
     *
     * Returned for `renderHaving` to compare against, in the same spirit as `groupByParts`
     * above: a metric filter that re-derived its own left-hand side compared the UNCAST value
     * while the SELECT printed the cast one, which dropped a group whose printed number
     * satisfied the predicate. Ordinary columns are deliberately absent — their projection and
     * their predicate use different qualifiers on BigQuery, and both are correct.
     */
    aggregateArgumentByLabel: ReadonlyMap<string, string>;
  } {
    const qualify = opts?.qualifyColumn;
    const timeZoneByColumn = opts?.timeZoneByColumn;
    const typeByColumn = opts?.typeByColumn;
    const aliasByColumn = new Map<string, string>();
    const groupByParts: string[] = [];
    const aggregateArgumentByLabel = new Map<string, string>();
    const selectParts = columns.flatMap(c => {
      const ref = qualify ? qualify(c) : this.quoteIdentifier(c);
      const fns = aggregationFunctionsForColumn(aggregations, c);
      if (fns.length > 0) {
        // One SELECT item per function, in rule order. The column is an aggregated
        // metric — never a GROUP BY key. aliasByColumn points at the FIRST function's
        // alias so ORDER BY on the column resolves to its first aggregation.
        const items = fns.map(fn => {
          const alias = this.quoteIdentifier(aggregatedColumnLabel(c, fn));
          if (!aliasByColumn.has(c)) aliasByColumn.set(c, alias);
          return `${this.renderAggregateExpression(fn, ref)} AS ${alias}`;
        });
        return items;
      }
      const outputAlias = this.quoteIdentifier(c);
      const unit = dateTruncByColumn?.get(c);
      if (unit) {
        const truncated = this.renderDateTrunc(
          ref,
          unit,
          timeZoneByColumn?.get(c),
          typeByColumn?.get(c)
        );
        groupByParts.push(truncated);
        aliasByColumn.set(c, outputAlias);
        return [`${truncated} AS ${outputAlias}`];
      }
      groupByParts.push(ref);
      aliasByColumn.set(c, outputAlias);
      // Flat path renders a bare reference (no AS); qualified mode must alias the
      // qualified reference back to the unqualified output column name.
      return [qualify ? `${ref} AS ${outputAlias}` : ref];
    });
    if (opts?.includeUniqueCount && opts?.primaryKeyColumns?.length) {
      selectParts.push(
        `${this.renderCountDistinctPrimaryKey(opts.primaryKeyColumns, qualify)} AS ${this.quoteIdentifier(UNIQUE_COUNT_LABEL)}`
      );
    }
    for (const metric of opts?.calculatedMetrics ?? []) {
      const renderOptions: CalculatedFieldRenderOptions = {
        qualifyColumn: qualify,
        calculatedMetricReplacements: opts?.calculatedMetricReplacements,
        resolveCalculatedMetricReference: opts?.resolveCalculatedMetricReference,
      };
      const outputAlias = this.quoteIdentifier(metric.outputName);
      // A GROUPING KEY joins the keys as its own rendered expression — the same string it
      // projects, exactly as the date-trunc branch above (spec §2.2), and it may carry a date
      // bucket on the same terms since slice 3b. Grouping by the COLUMNS the expression mentions
      // instead would be a finer grain, leaving the field's own value duplicated in a report
      // grouped by it. Both steps render through the PUBLIC seats a metric sleeve also calls, so
      // this key and the sleeve's projection of the same dimension are one derivation, not two.
      if (isCalculatedGroupingKey(metric)) {
        // The mirror of the refusal below, and the half that used to be missing. That one catches
        // "stamped aggregated, no rule here"; this one catches "a rule here, but nobody stamped the
        // plan" — which is not an error anywhere downstream, it just quietly makes the field a
        // grouping key and drops the aggregation the report asked for. Unreachable from the two
        // PROJECTING plan factories, which both stamp through `partitionCalculatedPlans`.
        //
        // A third builder already exists — `calculatedDependencyPlans` (#6732) — and deliberately
        // does not stamp, because a dependency is not a column and no report rule can name one. Its
        // plans reach the substitution seat only, never this branch. This guard is what stands
        // between that staying true and a row-level dependency silently becoming a grouping key.
        if (aggregationFunctionsForColumn(aggregations, metric.outputName).length > 0) {
          throw new Error(
            `renderAggregatedSelect: '${metric.outputName}' is a row-level calculated field an ` +
              `aggregation rule reaching this call names, but its plan is not marked aggregated by ` +
              `the report — build the plan through partitionCalculatedPlans instead of by hand`
          );
        }
        const expression = this.renderRowLevelDimensionExpression(metric, renderOptions);
        // The bucket, if the report asked for one (#6732 slice 3b, D16). Nothing is CAST first:
        // the probe measured `CAST(<expr> AS DATE)` returning `2026-05-01` on Redshift for a value
        // meaning the 5th of August, where the uncast shape errors — a cast here trades a loud
        // refusal for a wrong month. The DECLARED type is the type argument because a calculated
        // field has no warehouse column to read one from, and it travels ON THE PLAN so the sleeve
        // reproducing this key outside this class reaches the same string.
        const unit = dateTruncByColumn?.get(metric.outputName);
        const rendered = unit
          ? this.renderDateTruncExpression(
              expression,
              unit,
              timeZoneByColumn?.get(metric.outputName),
              metric.type
            )
          : expression;
        groupByParts.push(rendered);
        aliasByColumn.set(metric.outputName, outputAlias);
        selectParts.push(`${rendered} AS ${outputAlias}`);
        continue;
      }
      // Not a key. Reached through the sibling seat, which promises nothing about the grain.
      const expression = this.renderCalculatedFieldExpression(metric, renderOptions);
      // An AGGREGATING formula is projected but never grouped: it already IS an aggregate (spec
      // §2.3), so adding it to GROUP BY would both be invalid SQL and change the report's grain.
      if (isAggregateLevel(metric.level)) {
        selectParts.push(`${expression} AS ${outputAlias}`);
        continue;
      }
      // Row-level, and the REPORT aggregates it (#6732 spec §2.1): one SELECT item per function in
      // rule order, exactly as an ordinary column gets, over the substituted expression.
      const fns = aggregationFunctionsForColumn(aggregations, metric.outputName);
      if (fns.length === 0) {
        // Neither a key nor an aggregate here, so it would simply vanish from the query. A caller
        // that renders the report's grouping from an EMPTY rule list on purpose (the kept-groups
        // restriction) must drop such a plan through `isCalculatedGroupingKey` rather than pass it
        // — a restriction one key coarser than the report keeps a different row set.
        throw new Error(
          `renderAggregatedSelect: '${metric.outputName}' is a row-level calculated field the ` +
            `report aggregates, but no aggregation rule reaching this call names it — pass the ` +
            `rules its grain was decided from, or filter the plan out with isCalculatedGroupingKey`
        );
      }
      for (const fn of fns) {
        const label = aggregatedColumnLabel(metric.outputName, fn);
        const alias = this.quoteIdentifier(label);
        // As for a column: the map points at the FIRST function's alias, so ORDER BY on the field
        // resolves to its first aggregation.
        if (!aliasByColumn.has(metric.outputName)) aliasByColumn.set(metric.outputName, alias);
        const argument = this.renderAggregateArgument(fn, expression, metric.type);
        aggregateArgumentByLabel.set(label, argument);
        selectParts.push(`${this.renderAggregateExpression(fn, argument)} AS ${alias}`);
      }
    }
    const groupBySql = groupByParts.length ? `\nGROUP BY\n  ${groupByParts.join(',\n  ')}` : '';
    return {
      selectSql: selectParts.join(',\n  '),
      groupBySql,
      aliasByColumn,
      groupByParts,
      aggregateArgumentByLabel,
    };
  }

  /**
   * A row-level Calculated Field's substituted formula as the ARGUMENT of one report aggregation
   * (#6732, D18) — parenthesised always, and cast to the analyst's DECLARED type when the function
   * does arithmetic on the value.
   *
   * The cast is what closes a live wrong number. A declared type is never validated against the
   * formula (D3), so a FLOAT-declared field whose formula returns text is legal and already ships:
   * Redshift then coerces the varchar to `Decimal` with SCALE 0 and truncates every row before
   * summing, measured returning `12` where `12.75` is correct. Nothing else in the query states
   * the analyst's intent to the warehouse.
   *
   * A NO-OP whenever the formula already returns the declared type, which is the point: it must
   * not move any of the numbers the previous slice measured on five live warehouses. Where a
   * dialect states no cast target (`castTypeForDeclaredType` answers `undefined` — every
   * non-numeric declaration) the SQL is byte-identical to what it was.
   *
   * On BigQuery and Athena it makes `SUM` over a numeric-looking string START WORKING where it
   * raises today. That is the declaration finally reaching the warehouse, and the probe measured
   * `12.75` for it — not a regression.
   *
   * **The INTEGER family is excluded (D19b), though every dialect maps it.** The rule this method
   * implements is: replace an IMPLICIT coercion the warehouse was going to make anyway with an
   * EXPLICIT one of the same declared shape. A float or exact-decimal declaration is exactly that —
   * Redshift was already coercing the text to `Decimal`, badly, and the cast only states the scale.
   * An integer declaration is not: `SUM` over a float expression is simply a float sum, there is no
   * coercion to correct, so the cast would not fix a conversion — it would INTRODUCE a per-row one,
   * the very shape this slice exists to remove. And the dialects do not agree on its direction:
   * Spark truncates where BigQuery, Trino, Redshift and Snowflake round, so the same report would
   * total differently per warehouse. The seat still SPELLS the integer types, because that mapping
   * is a true statement about the dialect's SQL; declining to use it is this caller's policy.
   *
   * Only the aggregation's argument, never the expression itself: the SAME formula also renders as
   * a GROUPING KEY, and a metric sleeve reproduces that key outside this class and joins back on it
   * byte for byte. A cast applied one level down, in the shared render step, would leave the
   * join-back matching nothing.
   */
  private renderAggregateArgument(
    fn: ReportAggregateFunction,
    expression: string,
    declaredType: string
  ): string {
    // PARENTHESISED: a formula body is arbitrary user SQL, and its top-level operator would
    // otherwise bind against the aggregate's own syntax (Redshift's `||` — the operator-precedence trap this branch already had to fix once).
    const argument = `(${expression})`;
    if (!NUMERIC_ARGUMENT_FUNCTIONS.has(fn)) return argument;
    if (isIntegerType(declaredType)) return argument;
    const castType = this.castTypeForDeclaredType(declaredType);
    return castType ? `CAST(${argument} AS ${castType})` : argument;
  }

  /**
   * `<expression> AS <alias>` per calculated field, for the PLAIN (non-aggregated) shape — a
   * report whose only calculated field is row-level has no GROUP BY at all, so the field is
   * nothing but a projected expression (spec §2.1).
   *
   * Shares `renderCalculatedFieldExpression` with the grouped path on purpose: a second copy of
   * the parse-failure translation would drift, and the two shapes differ only in whether the
   * expression ALSO becomes a grouping key.
   *
   * Takes the WHOLE options object rather than a bare qualifier: the plain BLENDED path renders
   * here too, and it resolves a reference through the join tree exactly as its own grouped branch
   * does — so the same input gives the same SQL, and the same refusal, whether or not the report
   * happens to carry an aggregation rule. A flat builder passes none and gets the flat default.
   */
  renderCalculatedSelectItems(
    metrics: readonly CalculatedMetricPlan[] | undefined,
    opts: CalculatedFieldRenderOptions = {}
  ): string[] {
    return (metrics ?? []).map(
      metric =>
        `${this.renderCalculatedFieldExpression(metric, opts)} AS ` +
        `${this.quoteIdentifier(metric.outputName)}`
    );
  }

  /**
   * ORDER BY resolver for the PLAIN shape: a calculated field's name is a SELECT alias, never a
   * warehouse column, so a dialect that qualifies its predicates must NOT qualify this one —
   * `src.session_key` is an unrecognized name on BigQuery, the one dialect that aliases its FROM.
   * The aggregated shape answers the same question through `aliasByColumn`; this is its
   * counterpart for a query that has no alias map because it has no grouping.
   */
  buildPlainSelectAliasResolver(
    metrics: readonly CalculatedMetricPlan[] | undefined,
    qualifyColumn: ColumnRefResolver | undefined,
    /**
     * From {@link buildCalculatedSortExpressions}. Required — `undefined` must be a decision, not
     * an omission.
     */
    sortCasts: ReadonlyMap<string, string> | undefined
  ): ColumnRefResolver {
    const calculatedNames = new Set((metrics ?? []).map(metric => metric.outputName));
    const resolve = this.resolverOrFallback(qualifyColumn);
    return column =>
      calculatedNames.has(column)
        ? (sortCasts?.get(column) ?? this.quoteIdentifier(column))
        : resolve(column);
  }

  /**
   * How ORDER BY must spell each Calculated Field whose comparisons impose its declared type
   * (#6732, D23) — `CAST(<expr> AS <type>)`, built from the SAME two strings the filter's
   * left-hand side is built from, so the two can never name different values.
   *
   * Sorting IS comparison, and D23 stopped at the filter. A report that keeps rows numerically and
   * then orders them as text does not merely present them in a different order: under a LIMIT it
   * returns DIFFERENT ROWS. Measured — `WHERE CAST(s AS <float>) > 5 ORDER BY s DESC LIMIT 2`
   * returned `9, 100` where `100, 10` is correct, identically on BigQuery, Athena, Redshift and
   * Databricks. A plausible short report missing its largest value, with no error anywhere.
   *
   * The EXPRESSION is repeated rather than the output alias wrapped, and that is measured, not
   * stylistic: `ORDER BY CAST(<alias> AS …)` fails on Redshift — `column "v" does not exist` —
   * because an output name is visible there only as a bare ORDER BY term, never inside an
   * expression. Repeating the expression was measured working on all four, in both the plain and
   * the grouped shape.
   *
   * A field the REPORT aggregates is excluded, for two reasons that agree: its output alias names
   * the aggregate's value rather than the field's, and the declared type describes the field, not
   * an aggregate over it. Emitting the bare row-level expression there would also put a
   * non-grouping-key expression in an aggregated query.
   */
  buildCalculatedSortExpressions(
    metrics: readonly CalculatedMetricPlan[] | undefined,
    operands: ReadonlyMap<string, CalculatedPredicateOperand> | undefined,
    aggregations: AggregationRule[],
    opts: CalculatedFieldRenderOptions
  ): ReadonlyMap<string, string> {
    // The union is taken HERE, once, rather than by each dialect spreading two lists at its own
    // call site: that spread is exactly the shape H9 caught — five hand-copied copies, and
    // dropping one half of one of them is invisible to the compiler and to four of the five
    // suites. A field is sortable if the report PROJECTS it or a filter NAMES it, and a sort on a
    // projected-but-unfiltered field is wrong on its own — `ORDER BY <text> DESC LIMIT 10` over a
    // FLOAT-declared formula returns a lexicographic top ten with no filter involved at all.
    const combined = new Map(this.buildCalculatedPredicateExpressions(metrics, opts));
    // The filter's own operand wins wherever both exist, so a field that is filtered AND sorted
    // carries ONE string in both clauses rather than two that merely ought to agree.
    for (const [name, operand] of operands ?? []) combined.set(name, operand);

    const sorts = new Map<string, string>();
    for (const [name, operand] of combined) {
      if (!operand.castType) continue;
      if (aggregationFunctionsForColumn(aggregations, name).length > 0) continue;
      sorts.set(name, `CAST(${operand.expression} AS ${operand.castType})`);
    }
    return sorts;
  }

  /**
   * One calculated field's stored formula as SQL, and NOTHING about the query's grain — the
   * sibling of `renderRowLevelDimensionExpression`, which is that same render step plus the
   * promise that what comes back is a grouping key (#6732 spec §3).
   *
   * The single render step every shape goes through, so an unparseable formula is reported the
   * same way whichever shape the query took. Three callers, and only one of them is grouping by
   * the result: the plain projection, an aggregate-level field's own SELECT item, and the
   * expression a report's aggregation wraps — none may borrow the grouping seat for it, because
   * a row-level field the report aggregates is no longer a key.
   */
  private renderCalculatedFieldExpression(
    metric: CalculatedMetricPlan,
    opts: CalculatedFieldRenderOptions
  ): string {
    try {
      return this.expandCalculatedFormula(
        metric,
        opts,
        new Map((metric.dependencies ?? []).map(plan => [plan.outputName, plan])),
        // One guard per top-level expansion, carried ACROSS the re-entries below — a depth counter
        // inside `renderFormulaWithReplacements` restarts at zero on each one and sees nothing.
        new FormulaExpansionGuard(),
        // `metric` IS the selected field here; every re-entry below names it instead.
        undefined
      );
    } catch (e) {
      // A loop only reaches a report from a schema written by a path that skips save-time
      // validation (D14). Converted here for the same reason the parse failure below is: unguarded
      // the substitution recurses for ever, which is a stack overflow — a 500 naming no field at all.
      // Unbounded expansion, refused before the string that would kill the pod is built. Reported
      // as a 400 naming the selected field, like the loop below: the analyst can see which field
      // they put on the report, and nothing else in the chain.
      if (e instanceof FormulaExpansionTooLargeError) {
        throw new BusinessViolationException(
          `The calculated field '${metric.outputName}' cannot be computed: expanding its formula ` +
            `and the formulas it references produces more than ${e.budget} characters of SQL. ` +
            `Simplify the chain — a formula that references another one twice doubles the result ` +
            `each time`,
          { calculatedField: metric.outputName, expansionBudget: e.budget }
        );
      }
      if (e instanceof FormulaCycleError) {
        throw new BusinessViolationException(
          `The calculated field '${metric.outputName}' cannot be computed: ` +
            `${e.chain.join(' → ')} is a circular reference. Edit one of those formulas to break ` +
            `the loop`,
          { calculatedField: metric.outputName, cycle: [...e.chain] }
        );
      }
      // A formula persisted before save-time validation existed can be unparseable. The
      // composition-time validator reports that as a 400 naming the metric, but it only inspects
      // calculated fields once the Data Mart's schema has been actualized — so on a mart with no
      // actualized schema the parse error surfaced HERE, as an uncaught 500 from a Handlebars
      // parser the caller has never heard of. Same verdict, same channel, either way. Anything
      // else thrown by the renderer is a caller bug (overlapping replacement spans) and keeps
      // failing loudly as one.
      if (!(e instanceof FormulaReferenceSyntaxError)) throw e;
      throw new BusinessViolationException(
        `The calculated field '${metric.outputName}' has a formula that cannot be parsed: ` +
          `${e.message}. Edit the calculated field to repair it`,
        { calculatedField: metric.outputName }
      );
    }
  }

  /**
   * One formula's references turned into SQL, re-entering itself for every reference that names
   * another Calculated Field of the same Data Mart (#6732).
   *
   * Substitution happens HERE and only here, at compose time: nothing persists a substituted
   * formula, which is what makes editing the referenced formula reach every formula that reads it.
   *
   * A dependency is expanded with its OWN references PARENTHESISED — a formula body is arbitrary
   * user SQL, so `x / a + b` is valid and a different number from `x / (a + b)`, and Redshift's
   * `||` already cost this branch a fix in exactly that shape.
   *
   * A dependency is deliberately expanded with NEITHER the caller's joined reference resolver NOR
   * its replacement spans, so a joined reference inside one is refused by the flat resolver rather
   * than routed. That is an ACCESS-CONTROL rule, not a tidiness one (design §1): routing and
   * `assertAllRequestedSourcesAccessible` are both decided from the SELECTED metric's own text, so
   * a joined source reachable only THROUGH a dependency would be joined without ever being checked.
   */
  private expandCalculatedFormula(
    metric: CalculatedMetricPlan,
    opts: CalculatedFieldRenderOptions,
    closure: ReadonlyMap<string, CalculatedMetricPlan>,
    guard: FormulaExpansionGuard,
    /**
     * The field the REPORT selected, when `metric` is being substituted into it — `undefined` when
     * `metric` is that field. It carries no rendering consequence; it exists so a refusal raised
     * several hops down still names the field the analyst actually put on the report, which is the
     * only one they can see.
     */
    selected: CalculatedMetricPlan | undefined
  ): string {
    const isDependency = selected !== undefined;
    // `ref.path` means nothing to THIS renderer — resolving it needs the join tree — so a caller
    // with joined references supplies both channels: whole spans already rendered elsewhere (a call
    // lifted into a metric sleeve) and a resolver that knows a joined reference's unified name (a
    // call the outer SELECT computes itself). The FLAT renderer supplies neither, because it has no
    // joined source to route to, so it REFUSES a joined reference rather than guessing.
    const resolveReference =
      isDependency || !opts.resolveCalculatedMetricReference
        ? this.flatMetricReferenceResolver(metric, opts.qualifyColumn, selected)
        : opts.resolveCalculatedMetricReference;
    const replacements = isDependency
      ? []
      : (opts.calculatedMetricReplacements?.get(metric.outputName) ?? []);

    // LIVE references only, exactly as the closure that produced these plans, the save-time
    // dependency graph, the level walk and `brokenReferencesOf` all read a stored formula — and as
    // `flatMetricReferenceResolver` one method below already reads it. Substituting a commented-out
    // tag splices a whole expression into a comment, where its later lines escape onto live ones;
    // and because the guard keys on the name it pushed, a commented tag naming the field it sits in
    // refuses `b → b` — a legal, saved schema made unrunnable by a loop that is not in the SQL. A
    // non-live tag renders as the single token it always did. The scan is lazy and paid at most
    // once per formula: only a reference that actually names a closure member reaches it.
    let tokens: readonly SqlToken[] | undefined;
    const dependencyFor = (ref: FormulaReference): CalculatedMetricPlan | undefined => {
      if (ref.path !== '') return undefined;
      const candidate = closure.get(ref.field);
      if (!candidate) return undefined;
      tokens ??= scanSql(metric.formula);
      return isLiveReference(tokens, ref) ? candidate : undefined;
    };

    return this.closingAnyLineComment(
      guard.charge(
        metric.outputName,
        guard.expand(metric.outputName, () =>
          renderFormulaWithReplacements(
            metric.formula,
            ref => {
              const dependency = dependencyFor(ref);
              return dependency
                ? // PARENTHESISED: a formula body is arbitrary user SQL, so its top-level operator
                  // would otherwise re-bind against whatever the outer formula writes around it.
                  // `selected ?? metric` keeps the SELECTED field named however many hops down this
                  // goes — an intermediate dependency is no more visible to the analyst than a leaf.
                  `(${this.expandCalculatedFormula(dependency, opts, closure, guard, selected ?? metric)})`
                : resolveReference(ref);
            },
            replacements
          )
        )
      )
    );
  }

  /**
   * A rendered formula with a newline appended when it ENDS INSIDE a `--` comment, so that whatever
   * is written after it is SQL rather than more of that comment.
   *
   * A trailing `-- note` is legal in a stored formula, and EIGHT sites write on the same line after
   * a rendered one: the formula's own ` AS <alias>` in the grouped and plain shapes, the comma
   * before the next select item or grouping key, the parentheses the report's aggregate wrapper and
   * a substitution close, the ` AS <cast type>)` the declared-type cast closes with (#6732, D18),
   * the `, <unit>)` a date bucket closes with (#6732, D16 — a swallowed unit is an unterminated
   * `DATE_TRUNC`, not a lost alias), and — the most destructive — `renderNullSafeJoinOn`, which
   * joins its pairs with ` AND ` on ONE line and so lost the whole remainder of a join predicate,
   * parenthesis included.
   *
   * `SUM(x) -- note AS "a", SUM(y) AS "b"` reaches the warehouse as `SELECT SUM(x) SUM(y) AS "b"`.
   * The GROUP BY case is a syntax error too, not a coarser grain: `groupByParts` are joined with
   * `',\n  '`, so only the comma is inside the comment and the next key survives on its own line —
   * `GROUP BY CONCAT(x) CONCAT(y)`. The one genuinely SILENT shape is the LAST select item, which
   * loses only its ` AS "<alias>"` and comes back under an engine-generated name.
   *
   * Applied at the one render step every WHOLE formula goes through, so the outer GROUP BY key and
   * the metric sleeve's projection of the same dimension stay byte-identical — applying it per call
   * site is what would break that, and nothing but the byte-identity assertion in this file's spec
   * catches it (the blended builder's own drift backstop then throws, so the cost is a loud 500).
   * `renderFormulaSleeveValue` renders a formula SLICE outside this class and is the one path that
   * does not pass here; it is structurally immune, for the reason stated at its own call site.
   *
   * Idempotent: a text already ending in a newline does not end inside a comment.
   *
   * `--` only, deliberately. An UNTERMINATED block comment also runs to the end of the text, and no
   * newline closes one — that SQL is invalid before this renderer sees it, and appending a character
   * that cannot help would make this method claim more than it does.
   */
  private closingAnyLineComment(sql: string): string {
    const tokens = scanSql(sql);
    const last = tokens[tokens.length - 1];
    const endsInLineComment =
      last?.kind === 'comment' && last.end === sql.length && last.value.startsWith('--');
    return endsInLineComment ? `${sql}\n` : sql;
  }

  /**
   * A calculated field's expression AS A GROUPING KEY — the exact string `renderAggregatedSelect`
   * projects and pushes into `groupByParts` for the same plan and the same options.
   *
   * Row-level is necessary but no longer sufficient: a row-level field the REPORT aggregates is
   * not a key (#6732 spec §2), and the aggregate path reaches the same expression through
   * `renderCalculatedFieldExpression` instead. Everything below is about the KEY contract, which
   * that path makes no claim on. The level throw stays: it is the half this method can check
   * without the report's rules, and the half that is permanent.
   *
   * Public for the same reason `renderDateTruncExpression` is: a metric sleeve CTE is built OUTSIDE
   * this class hierarchy, in the blended-query builder, and must project the dimension the outer
   * GROUP BY keys on, byte for byte, because it joins back on that key. One method called with one
   * options object gives byte-identity by construction; two derivations of the string give it only
   * until one of them changes, and the join-back then matches nothing — a NULL, or a COALESCEd
   * zero, rather than an error.
   *
   * NOT the whole key when the report buckets the field (#6732 slice 3b): the outer SELECT feeds
   * what comes back to `renderDateTruncExpression` with the PLAN's declared type, and a caller
   * reproducing the key has to do the same, in that order.
   *
   * `opts.resolveCalculatedMetricReference` owns the verdict on a JOINED reference, since only the
   * caller knows the join tree. It should refuse one rather than qualify the joined name against
   * `main`: a row-level formula reads its own Data Mart only, permanently (spec §3.1) — outside an
   * aggregate call a joined reference is refused at save, and inside one the formula would not be
   * row-level. The default resolver, used when the caller supplies none, already refuses.
   */
  renderRowLevelDimensionExpression(
    plan: CalculatedMetricPlan,
    opts: CalculatedFieldRenderOptions = {}
  ): string {
    if (isAggregateLevel(plan.level)) {
      throw new Error(
        `renderRowLevelDimensionExpression: '${plan.outputName}' is level '${plan.level}', not ` +
          `row-level — an aggregate is projected but never becomes a grouping key`
      );
    }
    return this.renderCalculatedFieldExpression(plan, opts);
  }

  /**
   * How a metric's reference becomes SQL when the caller supplied no resolver of its own — i.e. on
   * the FLAT path, which has no joined source to route to.
   *
   * An own-Data-Mart reference is just its qualified column. A JOINED one is REFUSED rather than
   * qualified against the main table, because both outcomes of guessing are wrong and one of them
   * is silent: `main."amount"` is an "Unrecognized name" when main has no such column, and a
   * perfectly valid read of the WRONG column when it happens to have one — which is how a
   * save-time dry run went green and stamped `warehouseValidation: 'passed'` for a query the
   * warehouse never saw (#6732). Reaching here with a joined reference means the report was routed
   * to the flat builder despite reading a joined source, so failing loudly is the only honest
   * answer this renderer can give.
   *
   * LIVE references only: a tag inside a SQL comment or a string literal is not SQL, so commenting
   * an old joined reference out must not be what makes a metric unrenderable. The scan is lazy —
   * a formula with no joined reference at all never pays for it.
   *
   * `selected` distinguishes the two shapes, which need DIFFERENT advice. When `metric` is the
   * field the report selected, keeping the join is a real fix: the blended path lifts a joined call
   * into a metric sleeve. When `metric` is a dependency SUBSTITUTED into `selected`, it is not —
   * a dependency is expanded flat by design (see `expandCalculatedFormula`), so the source is never
   * joined for it however the report is built, and advice to keep the join sends the analyst to
   * rebuild a report that will fail again. Naming only the dependency is the other half of the
   * problem: the report mentions `selected`, and the analyst may never have opened the other one.
   */
  private flatMetricReferenceResolver(
    metric: CalculatedMetricPlan,
    qualify: ColumnRefResolver | undefined,
    selected?: CalculatedMetricPlan
  ): (ref: FormulaReference) => string {
    let tokens: readonly SqlToken[] | undefined;
    return ref => {
      if (ref.path !== '') {
        tokens ??= scanSql(metric.formula);
        if (isLiveReference(tokens, ref)) {
          const label = `${ref.path}.${ref.field}`;
          if (selected) {
            throw new BusinessViolationException(
              `The calculated field '${selected.outputName}' cannot be computed: it reads ` +
                `'${metric.outputName}', whose own formula reads '${label}' from a joined Data ` +
                `Mart. A referenced calculated field is substituted into the formula that reads ` +
                `it, so that source is never joined for it — no report can keep it. Remove the ` +
                `joined reference from '${metric.outputName}', or read '${label}' directly in ` +
                `'${selected.outputName}'`,
              {
                calculatedField: selected.outputName,
                dependency: metric.outputName,
                reference: label,
              }
            );
          }
          throw new BusinessViolationException(
            `The calculated field '${metric.outputName}' reads '${label}' from a ` +
              `joined Data Mart, but this query does not join that source. Select the calculated ` +
              `field on a report that keeps the join, or remove the joined reference from the formula`,
            { calculatedField: metric.outputName, reference: label }
          );
        }
      }
      return qualify?.(ref.field) ?? this.quoteIdentifier(ref.field);
    };
  }

  /**
   * Resolver for ORDER BY in an aggregated query: maps a column to its quoted output
   * alias (from `renderAggregatedSelect().aliasByColumn`), falling back to plain
   * quoting for any column not in the map.
   */
  buildAggregatedAliasResolver(
    aliasByColumn: ReadonlyMap<string, string>,
    /**
     * From {@link buildCalculatedSortExpressions}, and it takes precedence over the alias: a
     * calculated field's declared type has to reach its sort the same way it reaches its filter.
     * Required — `undefined` must be a decision, not an omission.
     */
    sortCasts: ReadonlyMap<string, string> | undefined
  ): ColumnRefResolver {
    return col => sortCasts?.get(col) ?? aliasByColumn.get(col) ?? this.quoteIdentifier(col);
  }

  /**
   * Truncates a date/timestamp column reference to a calendar bucket. When `timeZone`
   * is set, the value is converted to that zone BEFORE truncation; when absent, the
   * emitted SQL is unchanged from the no-tz form. The `timeZone` is a validated IANA
   * name inlined as a string literal (see IANA_TIME_ZONE_PATTERN — the injection guard).
   * Every dialect MUST override this — the base implementation only guards against a
   * missing override.
   */
  protected renderDateTrunc(
    _columnRef: string,
    _unit: DateTruncUnit,
    _timeZone?: string,
    _columnType?: string
  ): string {
    throw new Error('renderDateTrunc not implemented for this dialect');
  }

  /**
   * Public entry point for `renderDateTrunc`. A metric-sleeve CTE (built outside this
   * class hierarchy, in the blended-query builder) must reproduce the IDENTICAL
   * truncated expression the outer GROUP BY uses for the same dimension, so it needs
   * a callable path to the dialect's date-trunc rendering without duplicating it.
   */
  renderDateTruncExpression(
    columnRef: string,
    unit: DateTruncUnit,
    timeZone?: string,
    columnType?: string
  ): string {
    return this.renderDateTrunc(columnRef, unit, timeZone, columnType);
  }

  // Terminal injection gate: `unit`/`timeZone` are INLINED (not bound). Each dialect
  // override MUST call this first — a guard on the base renderDateTrunc alone never runs.
  protected assertSafeDateTrunc(unit: DateTruncUnit, timeZone?: string): void {
    if (!DATE_TRUNC_UNITS.includes(unit)) {
      throw new Error(`Unsupported date-trunc unit: ${String(unit)}`);
    }
    if (timeZone !== undefined && !IANA_TIME_ZONE_PATTERN.test(timeZone)) {
      throw new Error(`Invalid IANA time zone: ${String(timeZone)}`);
    }
  }

  // The one aggregation whose ANSWER differs per warehouse, not just its spelling: BigQuery and
  // Athena approximate and return a value from the data, PERCENTILE_CONT interpolates. On
  // [1,2,3,4] the median is 2 or 3 there and 2.5 here.
  protected renderPercentile(_p: 25 | 50 | 75 | 95, _columnRef: string): string {
    throw new Error(`Percentile aggregation not supported for this storage`);
  }

  protected renderStringAgg(_columnRef: string): string {
    throw new Error(`STRING_AGG not supported for this storage`);
  }

  protected renderAnyValue(columnRef: string): string {
    return `ANY_VALUE(${columnRef})`;
  }

  // Public because a metric sleeve computes its metric in its own CTE and needs this spelling —
  // two independent spellings of one function is the drift this class exists to prevent.
  renderAggregateExpression(fn: ReportAggregateFunction, columnRef: string): string {
    switch (fn) {
      case 'COUNT_DISTINCT':
        return `COUNT(DISTINCT ${columnRef})`;
      case 'STRING_AGG':
        return this.renderStringAgg(columnRef);
      case 'P25':
        return this.renderPercentile(25, columnRef);
      case 'P50':
        return this.renderPercentile(50, columnRef);
      case 'P75':
        return this.renderPercentile(75, columnRef);
      case 'P95':
        return this.renderPercentile(95, columnRef);
      case 'ANY_VALUE':
        return this.renderAnyValue(columnRef);
      case 'SUM':
      case 'MIN':
      case 'MAX':
      case 'AVG':
      case 'COUNT':
        return `${fn}(${columnRef})`;
      default: {
        const _exhaustive: never = fn;
        return _exhaustive;
      }
    }
  }

  renderOrderBy(sort: SortRule[], qualifyColumn?: ColumnRefResolver): RenderedClause {
    if (!sort.length) return { sql: '', params: [] };
    const resolve = this.resolverOrFallback(qualifyColumn);
    const parts = sort.map(r => `${resolve(r.column)} ${r.direction.toUpperCase()}`);
    return { sql: `\nORDER BY\n  ${parts.join(',\n  ')}`, params: [] };
  }

  renderLimit(limit: number | null | undefined): RenderedClause {
    if (limit == null) return { sql: '', params: [] };
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error(`Invalid LIMIT value: ${String(limit)}`);
    }
    return { sql: `\nLIMIT ${limit}`, params: [] };
  }

  /**
   * The WHOLE aggregated query for a flat (non-blended) data mart: projection, grouping, the
   * Totals group restriction, WHERE/HAVING, ORDER BY and LIMIT — assembled in one place.
   *
   * It exists because assembling it per dialect meant five copies of the same eight-step
   * sequence, and they had already drifted: the kept-groups restriction reached one builder with
   * a column qualifier and three without, Redshift passed it neither field types nor a type
   * resolver, and nothing in the type system objected. A sixth storage (Postgres-compatible
   * destinations are on the roadmap) would have compiled cleanly and been wrong in the same way —
   * or, worse, omitted the restriction entirely and silently computed Totals over hidden groups.
   *
   * What genuinely differs per dialect is expressed as parameters: how the source is written
   * (`fromClause`), whether columns are qualified (`qualifyColumn` — only BigQuery aliases its
   * source), and the type maps. Everything else, including the ORDER of the bound params, is
   * fixed here: positional dialects bind by position, so the array must follow the placeholders
   * in text order — kept-groups first, since its join precedes the outer WHERE.
   */
  renderAggregatedQuery(opts: {
    fromClause: string;
    columns: string[];
    aggregations: AggregationRule[];
    dateTruncs: DateTruncRule[];
    filters: FilterRule[];
    sort: SortRule[];
    limit: number | null | undefined;
    uniqueCount: boolean;
    primaryKeyColumns?: string[];
    groupRestriction?: GroupRestriction;
    /**
     * How a PREDICATE (WHERE, HAVING, the restriction's join) refers to a column. Only a dialect
     * whose FROM is aliased has one; the rest select bare names. Required — `undefined` must be
     * a decision, not an omission.
     */
    qualifyColumn: ColumnRefResolver | undefined;
    /**
     * How the PROJECTION and GROUP BY refer to a column — deliberately separate from
     * `qualifyColumn`. BigQuery qualifies its predicates but NOT its projection: after
     * `FROM … AS src` a bare name already resolves to a column of `src`, while qualifying it
     * would force nested-RECORD `AS` work. Required for the same reason.
     */
    qualifyProjection: ColumnRefResolver | undefined;
    /** Explicit `undefined` when the dialect has no field types — never silently omitted. */
    typeByColumn: ReadonlyMap<string, string> | undefined;
    /** Explicit `undefined` when the dialect inlines literals and needs no cast resolution. */
    resolveColumnType: ColumnTypeResolver | undefined;
    /** Calculated metrics selected alongside `columns` (spec §5.1, main-owner only). */
    calculatedMetrics?: readonly CalculatedMetricPlan[];
    /**
     * `buildCalculatedPredicateExpressions` over every Calculated Field a FILTER may name —
     * selected or not. Built by the dialect builder, because its plain branch needs the same map
     * and the two must be one derivation.
     */
    calculatedPredicateExpressions?: ReadonlyMap<string, CalculatedPredicateOperand>;
  }): RenderedClause {
    const { qualifyColumn, typeByColumn, resolveColumnType } = opts;
    const agg = this.renderAggregatedSelect(
      opts.columns,
      opts.aggregations,
      buildDateTruncUnitMap(opts.dateTruncs),
      {
        includeUniqueCount: opts.uniqueCount,
        primaryKeyColumns: opts.primaryKeyColumns,
        qualifyColumn: opts.qualifyProjection,
        timeZoneByColumn: buildTimeZoneMap(opts.dateTruncs),
        typeByColumn,
        calculatedMetrics: opts.calculatedMetrics,
      }
    );
    // Totals under a metric filter: restrict this query to the rows of the groups the report
    // keeps, since a Totals query has no GROUP BY for a HAVING to apply to.
    const keptGroups = this.renderKeptGroupsJoin({
      restriction: opts.groupRestriction,
      fromClause: opts.fromClause,
      filters: opts.filters,
      qualifyColumn,
      typeByColumn,
      resolveColumnType,
      calculatedPredicateExpressions: opts.calculatedPredicateExpressions,
    });
    const where = this.renderWhere(
      opts.filters,
      qualifyColumn,
      'p',
      resolveColumnType,
      opts.calculatedPredicateExpressions
    );
    // Post-aggregation filters become HAVING; WHERE skips them. Which is which comes off the
    // rule's carried clause (D21), never from `rule.function`. The projection's own aggregate
    // arguments travel with them, so a filter on a calculated field compares the string the
    // SELECT prints rather than a second rendering of it.
    const having = this.renderHaving(
      opts.filters,
      qualifyColumn,
      'h',
      resolveColumnType,
      agg.aggregateArgumentByLabel,
      opts.calculatedPredicateExpressions
    );
    // ORDER BY must reference the output alias — a bare aggregated column is not in GROUP BY —
    // except for a calculated field carrying a declared-type cast, which sorts by the same cast
    // expression its filter compares (D23, extended to the sort).
    const orderBy = this.renderOrderBy(
      opts.sort,
      this.buildAggregatedAliasResolver(
        agg.aliasByColumn,
        this.buildCalculatedSortExpressions(
          opts.calculatedMetrics,
          opts.calculatedPredicateExpressions,
          opts.aggregations,
          { qualifyColumn }
        )
      )
    );
    const limit = this.renderLimit(opts.limit ?? null);

    return {
      sql:
        `${composeSelectFromClause(agg.selectSql, `${opts.fromClause}${keptGroups.sql}`)}` +
        `${where.sql}${agg.groupBySql}${having.sql}${orderBy.sql}${limit.sql}`,
      params: [
        ...keptGroups.params,
        ...where.params,
        ...having.params,
        ...orderBy.params,
        ...limit.params,
      ],
    };
  }

  /**
   * The join that restricts a Totals query to the rows of the groups its report keeps.
   *
   * Totals have no GROUP BY, so the report's metric (HAVING) filters cannot apply there — and
   * dropping them makes Totals summarise rows the report hides. This re-runs the report's own
   * grouping as a derived table and joins it: a GROUP BY result has distinct tuples, so it
   * filters rows without duplicating any, and every metric is then computed over the surviving
   * ROWS. That is what keeps a symmetric aggregate right — an entity in two surviving groups
   * still counts once — which summing per-group values would not.
   *
   * Returns an empty clause when the report has no metric filter, so the SQL is unchanged.
   */
  renderKeptGroupsJoin(opts: {
    restriction?: GroupRestriction;
    /** The SAME source expression the outer query reads (its own scope inside the subquery). */
    fromClause: string;
    filters: FilterRule[];
    /** How the OUTER query refers to a column — the subquery reads the same source. */
    qualifyColumn?: ColumnRefResolver;
    /**
     * Column → storage field type. Not optional: it decides the NaN-safe leg of the join, and a
     * dialect that forgets to pass it silently drops NaN rows from Totals instead of failing.
     * Pass `undefined` explicitly when the caller genuinely has no types.
     */
    typeByColumn: ReadonlyMap<string, string> | undefined;
    /** The SAME resolver the outer WHERE/HAVING uses, so a date cast matches byte-for-byte. */
    resolveColumnType: ColumnTypeResolver | undefined;
    /** The SAME map the outer WHERE/HAVING uses — see `buildCalculatedPredicateExpressions`. */
    calculatedPredicateExpressions?: ReadonlyMap<string, CalculatedPredicateOperand>;
    alias?: string;
  }): RenderedClause {
    const restriction = opts.restriction;
    if (!restriction?.having.length) return { sql: '', params: [] };

    const alias = opts.alias ?? KEPT_GROUPS_CTE;
    const quotedAlias = this.quoteIdentifier(alias);
    // The buckets come from the RESTRICTION, not from this query's own `dateTruncs`: a Totals
    // query has none (no GROUP BY), so reading them here would regroup at the raw grain.
    const dateTruncs = restriction.dateTruncs ?? [];
    // Only a GROUPING KEY contributes a key: an aggregate-level plan already IS an aggregate, and
    // a row-level one the report aggregates has stopped being a key (#6732 spec §2.1) — passed on,
    // it has no rule to render from here (see below) and would vanish from the subquery. So the
    // calculated keys are a FILTERED SUBSEQUENCE of `calculatedDimensions`, and `dimensions` is
    // rebuilt from that same filtered array rather than taken as given — the positional pairing
    // below indexes the two together, and an off-by-one there is a wrong number, not an error.
    const calculatedDimensions = (restriction.calculatedDimensions ?? []).filter(
      isCalculatedGroupingKey
    );
    const calculatedNames = new Set(calculatedDimensions.map(metric => metric.outputName));
    const columnDimensions = restriction.dimensions.filter(name => !calculatedNames.has(name));
    // Column keys first in projection order, then the row-level ones in plan order — the order
    // `renderAggregatedSelect` emits `groupByParts` in.
    const dimensions = [...columnDimensions, ...calculatedDimensions.map(m => m.outputName)];
    // No metrics in the projection: HAVING renders its own aggregate expressions, so the
    // subquery only has to carry the dimension tuple. Passing NO aggregation rules is also what
    // makes every dimension a GROUP BY key (see `buildKeptGroupsProjection`).
    const grouped = this.renderAggregatedSelect(
      columnDimensions,
      [],
      buildDateTruncUnitMap(dateTruncs),
      {
        qualifyColumn: opts.qualifyColumn,
        timeZoneByColumn: buildTimeZoneMap(dateTruncs),
        typeByColumn: opts.typeByColumn,
        calculatedMetrics: calculatedDimensions.length > 0 ? calculatedDimensions : undefined,
      }
    );
    const projection = buildKeptGroupsProjection(grouped.groupByParts, dimensions, name =>
      this.quoteIdentifier(name)
    );
    const where = this.renderWhere(
      opts.filters,
      opts.qualifyColumn,
      'kgp',
      opts.resolveColumnType,
      opts.calculatedPredicateExpressions
    );
    // This subquery projects the dimension tuple alone, so nothing here renders the aggregate the
    // report printed and there is no `aggregateArgumentByLabel` to pass on — it is built from the
    // restriction's own plans instead, through the same seats the projection used (D18). The
    // PREDICATE qualifier, matching the grouping keys above: both scopes read the same FROM, so a
    // dialect that qualifies its predicates spells this argument differently from the report's
    // projection and selects the same groups.
    const having = this.renderHaving(
      restriction.having,
      opts.qualifyColumn,
      'kgh',
      opts.resolveColumnType,
      this.buildCalculatedAggregateArguments(
        restriction.calculatedHavingMetrics,
        restriction.having,
        { qualifyColumn: opts.qualifyColumn }
      ),
      opts.calculatedPredicateExpressions
    );
    const subquery =
      `SELECT\n  ${projection.join(',\n  ')}\nFROM ${opts.fromClause}` +
      `${where.sql}${grouped.groupBySql}${having.sql}`;
    const params = [...where.params, ...having.params];

    // No dimensions: the report is a single grand-total group the HAVING either keeps or drops,
    // and a CROSS JOIN reproduces exactly that (zero rows out when it dropped).
    if (dimensions.length === 0) {
      return { sql: `\nCROSS JOIN (\n${subquery}\n) AS ${quotedAlias}`, params };
    }
    const pairs = buildKeptGroupsJoinPairs(
      grouped.groupByParts,
      dimensions,
      quotedAlias,
      name => this.quoteIdentifier(name),
      column => isFloatingPointType(opts.typeByColumn?.get(column))
    );
    return {
      sql: `\nJOIN (\n${subquery}\n) AS ${quotedAlias} ON ${this.renderNullSafeJoinOn(pairs)}`,
      params,
    };
  }

  /**
   * NULL-safe equality for a dimension-tuple join: `(a) = (b) OR ((a) IS NULL AND (b) IS NULL)`
   * per pair, ANDed. Used to join a metric sleeve back on the report dimensions without
   * dropping NULL-dimension buckets. BigQuery/Athena have no portable IS NOT DISTINCT FROM.
   *
   * Each side is parenthesised because neither is under this function's control: a grouping key
   * can be a date bucket or a whole calculated-field formula. Redshift binds `=` TIGHTER than
   * `||`, so a bare `a || b = k` parses as `a || (b = k)` and the warehouse rejects the join —
   * and Totals being best-effort, the analyst simply loses the block with no message.
   */
  renderNullSafeJoinOn(pairs: { left: string; right: string; nanSafe?: boolean }[]): string {
    return pairs
      .map(({ left, right, nanSafe }) => {
        const leftExpr = `(${left})`;
        const rightExpr = `(${right})`;
        // GROUP BY buckets all NaNs together, but `NaN = NaN` is FALSE on BigQuery and Trino
        // (Snowflake, Redshift and Spark treat them as equal), so a float dimension holding a
        // NaN would land in one outer group yet match no sleeve row — a metric silently read
        // as NULL, or 0 once the COUNT DISTINCT pull coalesces. `x != x` is true only for NaN,
        // and is a harmless no-op on the dialects that already match.
        const nanLeg = nanSafe
          ? ` OR (${leftExpr} != ${leftExpr} AND ${rightExpr} != ${rightExpr})`
          : '';
        return `(${leftExpr} = ${rightExpr} OR (${leftExpr} IS NULL AND ${rightExpr} IS NULL)${nanLeg})`;
      })
      .join(' AND ');
  }

  /**
   * Hook for a dialect-specific invariant check on a freshly rendered fragment.
   * Default: no-op. Positional dialects (Athena `?`) override this to assert that
   * the placeholder count equals params.length — positional binding silently
   * misaligns every subsequent value when a fragment emits the wrong count, so
   * we fail fast at render time instead of producing a subtly wrong query.
   */
  protected validateFragment(_clause: RenderedClause): void {
    // no-op by default; named-parameter dialects (BigQuery `@name`) may reuse a
    // name across placeholders, so occurrence count need not equal params.length.
  }

  /**
   * IN/NOT IN for param-binding dialects: one placeholder and one param per value,
   * names advanced sequentially so positional binders stay aligned. `placeholderFor`
   * supplies the dialect's placeholder text for a given param name (BigQuery returns
   * `@name`/CAST-wrapped, Athena ignores the name and returns `?`).
   */
  protected renderInListWithParams(
    rule: Extract<FilterRule, { operator: 'in' | 'not_in' }>,
    col: string,
    paramName: string,
    placeholderFor: (name: string) => string
  ): RenderedClause {
    const placeholders: string[] = [];
    const params: SqlParameter[] = [];
    let name = paramName;
    for (const v of rule.value) {
      placeholders.push(placeholderFor(name));
      params.push({ name, value: v });
      name = this.nextParamName(name);
    }
    return {
      sql: this.inListSql(rule.operator, col, placeholders.join(', ')),
      params,
    };
  }

  /** IN/NOT IN for literal-inlining dialects: `lit` is the dialect's escaping formatter. */
  protected renderInListWithLiterals(
    rule: Extract<FilterRule, { operator: 'in' | 'not_in' }>,
    col: string,
    lit: (value: string | number | boolean | null) => string
  ): RenderedClause {
    return {
      sql: this.inListSql(rule.operator, col, rule.value.map(v => lit(v)).join(', ')),
      params: [],
    };
  }

  /**
   * Null-inclusive `NOT IN`: SQL `NOT IN` drops NULLs (UNKNOWN), but "is none of"
   * should keep rows where the column is missing — treat NULL as "not any of the
   * listed values". Matches the null-inclusive `neq` / `not_contains` operators.
   */
  private inListSql(operator: 'in' | 'not_in', col: string, list: string): string {
    return operator === 'in'
      ? `${col} IN (${list})`
      : `(${col} IS NULL OR ${col} NOT IN (${list}))`;
  }

  protected nextParamName(paramName: string): string {
    const match = paramName.match(/^(.*?)(\d+)$/);
    if (!match) {
      throw new Error(`Cannot derive next param name from "${paramName}"`);
    }
    return `${match[1]}${Number(match[2]) + 1}`;
  }
}
