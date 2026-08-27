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
import {
  categorizeFieldType,
  isFloatingPointType,
  isIntegerType,
} from '../../dto/schemas/field-type-category';
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

export type ColumnRefResolver = (column: string) => string;

/**
 * Resolves the storage field type for a filter rule's column. Positional dialects (Athena) cast
 * date/time placeholders with it so a varchar literal is not compared against a DATE column.
 * Undefined when unknown — the renderer then emits a plain placeholder.
 */
export type ColumnTypeResolver = (rule: FilterRule) => string | undefined;

/**
 * The ONE type a filter path resolves a rule against: an ordinary column's storage type, and a
 * Calculated Field's DECLARED type. Without the declared type the VALUE's JS type decides, and
 * `= 10` versus `= '10'` over one field flipped BigQuery and Athena between a hard error and the
 * right answer.
 */
export function buildFilterTypeResolver(
  columnTypes: ReadonlyMap<string, string> | undefined,
  calculatedFields: readonly CalculatedFieldPlan[] | undefined,
  storageType: DataStorageType
): ColumnTypeResolver | undefined {
  const declaredTypes = declaredTypeByCalculatedField(calculatedFields);
  if (!columnTypes && declaredTypes.size === 0) return undefined;
  return rule =>
    effectiveComparisonType(
      declaredTypes.get(rule.column) ?? columnTypes?.get(rule.column),
      rule,
      storageType
    );
}

/**
 * One Calculated Field's predicate LEFT-HAND SIDE, and the type a comparison on it imposes. The
 * two travel together so the expression and the value cannot be cast to different targets; nothing
 * downstream may cast `expression` on its own.
 */
export interface CalculatedPredicateOperand {
  /** The substituted formula, parenthesised. Never cast — see {@link COMPARISON_OPERATORS}. */
  expression: string;
  /** The declared type this field's comparisons impose, or `undefined` when they impose none. */
  castType?: string;
}

/**
 * The operators whose predicate compares a VALUE, and therefore the only ones a declared type is
 * imposed on. Casting elsewhere can only hurt — `is_null` looks at no value, and casting there
 * would make one unparseable row fail a query that used to return rows.
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
 * Each Calculated Field's declared type by output name, read by both
 * {@link buildFilterTypeResolver} and the blended filter partition.
 */
export function declaredTypeByCalculatedField(
  ...groups: readonly (readonly CalculatedFieldPlan[] | undefined)[]
): ReadonlyMap<string, string> {
  const types = new Map<string, string>();
  for (const group of groups) {
    for (const metric of group ?? []) types.set(metric.outputName, metric.type);
  }
  return types;
}

/**
 * A calculated field selected in this query. `formula` is the STORED form — dialect SQL with
 * `{{ref}}` tags, substituted at render time. `type` is the analyst's declaration; there is no
 * warehouse column to derive one from.
 */
export interface CalculatedFieldPlan {
  outputName: string;
  formula: string;
  type: string;
  /**
   * Whether the FORMULA aggregates. For "is this a grouping key" ask `isCalculatedGroupingKey`.
   *
   * Required, unlike everything else here, because the two readings differ by a GROUP BY rather
   * than by an error: defaulted to metric, a row-level field returns a plausible wrong number.
   * Build it with `calculatedFieldLevelOf`, never by copying the schema field's own `level`.
   */
  level: CalculatedFieldLevel;
  /**
   * Whether the REPORT applies an aggregation rule to this field — decided once by
   * `partitionCalculatedPlans`. Absent means no rule names the field.
   */
  isAggregatedByReport?: boolean;
  /**
   * Which Data Mart each aggregate call of `formula` reads from, for the BLENDED builder. Absent
   * means "not analysed", NOT "everything is main-owner": without it the builder refuses a formula
   * naming a joined source rather than qualifying that name against `main`.
   */
  formulaOwnership?: FormulaOwnerAnalysis;
  /**
   * The analyst's display label and description. Neither reaches the SQL, but this plan is the only
   * header source a calculated field has: without them a metric aliased "CTR, %" is the one column
   * in its own report still headed `ctr`.
   */
  alias?: string;
  description?: string;
  /**
   * The plans this formula's `{{ref}}` tags need SUBSTITUTED into it — the transitive closure of
   * the calculated fields it reads, flat and de-duplicated.
   *
   * A dependency is NOT a column: it lives inside the plan that needs it, never beside it in
   * `calculatedFields`, which every downstream surface derives a projection and a header from.
   * A report selecting `roas` must not gain `revenue` and `cost` as columns.
   *
   * Flat rather than nested so a cyclic schema cannot build a cyclic object graph. The field that
   * CLOSES a loop stays in the list, so the renderer refuses it by name.
   */
  dependencies?: readonly CalculatedFieldPlan[];
}

/**
 * The channels one calculated field's references become SQL through. Exported because the blended
 * builder's metric sleeve renders outside this class hierarchy and must pass the SAME object the
 * outer SELECT was given, or the two renderings drift.
 */
export interface CalculatedFieldRenderOptions {
  qualifyColumn?: ColumnRefResolver;
  calculatedFieldReplacements?: ReadonlyMap<string, readonly FormulaSpanReplacement[]>;
  resolveCalculatedFieldReference?: (ref: FormulaReference) => string;
}

/**
 * Whether a set of calculated fields forces the AGGREGATED query shape.
 *
 * Only an aggregating formula does. A row-level one is a dimension, and flipping the shape for it
 * would turn a plain projection into an implicit DISTINCT — fewer rows, no error, no signal.
 *
 * Callers pass the SELECTED metrics AND the FILTERED ones: a predicate on an aggregate-level field
 * forces the shape just as selecting one does, and a report that filters on one without selecting
 * it would otherwise take the plain branch and have its predicate refused as homeless.
 */
export function hasAggregateCalculatedField(
  metrics: readonly CalculatedFieldPlan[] | undefined
): boolean {
  return (metrics ?? []).some(metric => isAggregateLevel(metric.level));
}

// Matches BigQuery named-parameter rules — fail fast instead of waiting for BQ to reject it.
const PARAM_PREFIX_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The plain (non-aggregated) SELECT body with each calculated field appended as its own
 * projected expression.
 *
 * `*` is DROPPED once there is a calculated item: `SELECT *, <expr> AS f` would widen the report to
 * every warehouse column, while the aggregated sibling handed the same empty column list projects
 * the field alone.
 */
export function composePlainSelectBody(
  selectList: string,
  calculatedItems: readonly string[]
): string {
  if (calculatedItems.length === 0) return selectList;
  return [...(selectList === '*' ? [] : [selectList]), ...calculatedItems].join(',\n  ');
}

/**
 * Refuses a HAVING-routed rule on a query shape that emits no HAVING clause.
 *
 * A plain branch renders WHERE, ORDER BY and LIMIT and never calls `renderHaving`, so a rule routed
 * to HAVING there is applied in NEITHER clause and the report silently returns rows it was told to
 * drop. Reachable for a filter on an aggregate-level field the report does not select.
 *
 * The type system cannot reach it: `clause` is a property of the RULE, and the branch is chosen
 * after the filters are rendered.
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

/** `selectBody` is either `*` or a column list already joined with `,\n  `. */
export function composeSelectFromClause(selectBody: string, fromClause: string): string {
  // Reachable: a report with no explicit projection plus a filter on an aggregate-level Calculated
  // Field takes the AGGREGATED branch with `columns: []`, leaving nothing to project. Thrown rather
  // than defaulted because both defaults are wrong — `*` under a GROUP BY is a different wrong
  // answer, and dropping the filter discards what the analyst asked for.
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
     * The SQL type this comparison imposes on the VALUE — set only when `columnRef` is
     * a Calculated Field's formula that a COMPARISON operator is being applied to, and then it is
     * the SAME target `columnRef` is already cast to, because both come from one `castType` in
     * `imposeDeclaredType`. Every value slot the operator emits must carry it: a range bound or a
     * list member that skipped it is compared under a different type from the one beside it.
     * `undefined` leaves the dialect's own value handling exactly as it is.
     */
    valueCastType?: string
  ): RenderedClause;

  /**
   * The SQL type a COMPARISON imposes on a Calculated Field's declared type — the
   * predicate-side analogue of `renderAggregateArgument`, following that rule exactly.
   *
   * Floating-point and exact-decimal declarations only: the INTEGER family is excluded
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
   * rendered as.
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
   * A Calculated Field's formula as the LEFT-HAND SIDE of a predicate, per output name.
   *
   * Parenthesised: Redshift binds `=` tighter than `||`, so a bare `a || b = 'x'` parses as
   * `a || (b = 'x')` and is rejected.
   *
   * Never cast here. The declared type travels beside the expression as `castType` and is applied
   * per RULE, because `IS NULL` looks at no value and casting it would fail the whole query.
   * The target comes off the PLAN, not the filter path's type resolver, so it cannot depend on a
   * caller having wired one — without it Redshift compares a FLOAT-declared text formula
   * lexicographically and returns `9` out of `9, 10, 100`, with no error.
   */
  buildCalculatedPredicateExpressions(
    metrics: readonly CalculatedFieldPlan[] | undefined,
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
   * That caller is the Totals group restriction, whose subquery SELECT carries the dimension tuple
   * alone, so no projection there renders `SUM(<formula>)`. Rendered through the same two seats the
   * projection uses, so the declared-type cast comes from one rule rather than two agreeing ones.
   *
   * NOT `buildCalculatedPredicateExpressions`' map: those operands are cast per OPERATOR where an
   * aggregate argument is cast per FUNCTION, so `MIN` would gain a cast the projection lacks.
   */
  buildCalculatedAggregateArguments(
    metrics: readonly CalculatedFieldPlan[] | undefined,
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
    // — never re-derived from `rule.function`, which cannot express an aggregate-level
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
   * Renders the HAVING clause for post-aggregation filters. The left-hand side is the same
   * aggregate EXPRESSION the SELECT emits, not the output alias, which several dialects forbid in
   * HAVING. `qualifyColumn` MUST match the one passed to `renderAggregatedSelect`, or
   * `SUM(main.col)` in SELECT and `SUM(col)` in HAVING are different expressions.
   *
   * `aggregateArgumentByLabel` carries the arguments the SELECT already emitted, so the predicate
   * and the projection are one derivation. Re-deriving here is what made a Redshift report print
   * `1.75` and then drop the group for failing `> 1.5`, since the declared-type cast lives on the
   * projection side only.
   *
   * `calculatedExpressions` answers the other post-aggregation shape: a filter on an
   * AGGREGATE-level field, which carries no `function`, so its LHS is the formula itself.
   */
  renderHaving(
    filters: FilterRule[],
    qualifyColumn?: ColumnRefResolver,
    paramPrefix = 'h',
    resolveColumnType?: ColumnTypeResolver,
    aggregateArgumentByLabel?: ReadonlyMap<string, string>,
    calculatedExpressions?: ReadonlyMap<string, CalculatedPredicateOperand>
  ): RenderedClause {
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
      // A rule routed here with no `function` is an AGGREGATE-level Calculated Field's filter:
      // its left-hand side is the field's own formula, and the plan carrying it must have
      // reached this call. Refusing when it has not — rather than skipping the rule — is what keeps
      // the failure loud: skipped, the predicate applies in NEITHER clause and the report keeps
      // rows it was told to drop, with nothing to say so.
      let lhs: string;
      let valueCastType: string | undefined;
      if (fn) {
        const label = aggregatedColumnLabel(rule.column, fn);
        const argument = aggregateArgumentByLabel?.get(label);
        // Without an argument `resolve` would emit the field's NAME, a SELECT alias no warehouse
        // has a column for. Loud, because the seat that falls through here is the Totals
        // restriction, whose failure is swallowed.
        if (argument === undefined && calculatedExpressions?.has(rule.column)) {
          throw new Error(
            `renderHaving: filter on '${label}' aggregates a calculated field, but no aggregate ` +
              `argument for it reached this renderer — its left-hand side is the argument the ` +
              `projection was given, and the field's own name resolves to nothing`
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
   * The SQL type keyword for `CAST(<col> AS <type>)` inside the UNIQUE COUNT composite-PK tuple —
   * BigQuery/Databricks say STRING, Snowflake/Redshift/Athena say VARCHAR. Abstract with no
   * default: single-key tests never cast, so a default would pass them all and fail in the
   * warehouse on the first composite key.
   */
  public abstract textCastType(): string;

  /**
   * The SQL type name this dialect accepts in `CAST(<expr> AS <type>)` for a field the analyst
   * DECLARED as `declaredType` — or `undefined` when this dialect states none, which means the
   * caller emits no cast rather than guess a spelling.
   *
   * A declaration is a name from this dialect's FIELD-TYPE vocabulary, which is not always SQL:
   * BigQuery declares `FLOAT` where GoogleSQL says `FLOAT64`, and substituting it verbatim is
   * answered `Type not found: FLOAT`.
   *
   * A target may WIDEN a declared float but never narrows one, so the 32-bit declarations map to
   * the dialect's 64-bit float: the expression already computes in 64 bits, and a faithful 32-bit
   * target would round a correct number for nothing. Integer and exact types stay faithful — those
   * declare a grain the analyst chose.
   *
   * NUMERIC vocabulary only. A date spelling would let a caller cast before `DATE_TRUNC`, which
   * turns a loud Redshift error into the wrong month.
   */
  public abstract castTypeForDeclaredType(declaredType: string): string | undefined;

  /**
   * How this warehouse spells string concatenation. Read by the flat Unique Count alone — the
   * blended path carries a row identity as separate tuple slots. Redshift's CONCAT takes exactly
   * two arguments and overrides this with a `||` chain.
   */
  public textConcat(parts: readonly string[]): string {
    return naryTextConcat(parts);
  }

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

  /**
   * Renders the SELECT list and GROUP BY for an aggregated query. Group-by is implied: any projected
   * column without an aggregation rule becomes a grouping key, in projection order.
   *
   * `aliasByColumn` maps each projected column to its quoted output alias. Feed it to
   * `buildAggregatedAliasResolver` so ORDER BY names the alias — a bare aggregated column is not in
   * GROUP BY and is a SQL error.
   *
   * `opts.qualifyColumn` qualifies the FN argument, dimension expression and GROUP BY key with a CTE
   * alias for the blended builder; the output alias stays unqualified either way.
   */
  renderAggregatedSelect(
    columns: string[],
    aggregations: AggregationRule[],
    dateTruncByColumn?: ReadonlyMap<string, DateTruncUnit>,
    opts?: {
      includeUniqueCount?: boolean;
      primaryKeyColumns?: string[];
      qualifyColumn?: ColumnRefResolver;
      timeZoneByColumn?: ReadonlyMap<string, string>;
      // column → storage field type, so a dialect can render date-trunc type-aware
      // (e.g. BigQuery must treat a tz-naive DATETIME differently from a TIMESTAMP).
      typeByColumn?: ReadonlyMap<string, string>;
      // Only a GROUPING KEY groups by its own rendered expression, appended after every column key.
      calculatedFields?: readonly CalculatedFieldPlan[];
      // Spans of a STORED formula already rendered elsewhere and swapped in verbatim — a joined
      // aggregate call replaced by its metric sleeve's pull. References inside one are not
      // resolved here; the sleeve resolved them against its own owner.
      calculatedFieldReplacements?: ReadonlyMap<string, readonly FormulaSpanReplacement[]>;
      // How ONE reference becomes SQL. Defaults to `qualifyColumn` over the field name; the blended
      // builder supplies one that also resolves a JOINED reference, since it knows the join tree.
      resolveCalculatedFieldReference?: (ref: FormulaReference) => string;
    }
  ): {
    selectSql: string;
    groupBySql: string;
    aliasByColumn: ReadonlyMap<string, string>;
    // The individual GROUP BY key expressions, exactly as emitted, so a caller can assert that an
    // expression it built elsewhere — a metric sleeve's projected dimension — is byte-identical to
    // the outer grouping key it joins back on.
    groupByParts: readonly string[];
    /**
     * The ARGUMENT each aggregate call over a report-aggregated Calculated Field was given —
     * the substituted formula, parenthesised, and cast to the declared type where the function
     * does arithmetic — keyed by `aggregatedColumnLabel(outputName, fn)`.
     *
     * Returned for `renderHaving`: a metric filter that re-derived its own left-hand side compared
     * the UNCAST value while the SELECT printed the cast one, dropping a group whose printed number
     * satisfied the predicate. Ordinary columns are absent — their projection and their predicate
     * use different qualifiers on BigQuery, and both are correct.
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
        // aliasByColumn points at the FIRST function's alias, so ORDER BY on the column resolves
        // to that aggregation.
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
      return [qualify ? `${ref} AS ${outputAlias}` : ref];
    });
    if (opts?.includeUniqueCount && opts?.primaryKeyColumns?.length) {
      selectParts.push(
        `${this.renderCountDistinctPrimaryKey(opts.primaryKeyColumns, qualify)} AS ${this.quoteIdentifier(UNIQUE_COUNT_LABEL)}`
      );
    }
    for (const metric of opts?.calculatedFields ?? []) {
      const renderOptions: CalculatedFieldRenderOptions = {
        qualifyColumn: qualify,
        calculatedFieldReplacements: opts?.calculatedFieldReplacements,
        resolveCalculatedFieldReference: opts?.resolveCalculatedFieldReference,
      };
      const outputAlias = this.quoteIdentifier(metric.outputName);
      // Grouped by its own rendered expression, the same string it projects. Grouping by the
      // COLUMNS the expression mentions would be a finer grain, leaving the field's own value
      // duplicated in a report grouped by it.
      if (isCalculatedGroupingKey(metric)) {
        // "A rule here, but nobody stamped the plan" is not an error anywhere downstream: it
        // quietly makes the field a grouping key and drops the aggregation the report asked for.
        // `calculatedDependencyPlans` deliberately does not stamp, and this guard is what keeps one
        // of its plans from reaching here and silently becoming a grouping key.
        if (aggregationFunctionsForColumn(aggregations, metric.outputName).length > 0) {
          throw new Error(
            `renderAggregatedSelect: '${metric.outputName}' is a row-level calculated field an ` +
              `aggregation rule reaching this call names, but its plan is not marked aggregated by ` +
              `the report — build the plan through partitionCalculatedPlans instead of by hand`
          );
        }
        const expression = this.renderRowLevelDimensionExpression(metric, renderOptions);
        // Nothing is CAST first: `CAST(<expr> AS DATE)` was measured returning `2026-05-01` on
        // Redshift for a value meaning the 5th of August, where the uncast shape errors — a cast
        // here trades a loud refusal for a wrong month.
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
      const expression = this.renderCalculatedFieldExpression(metric, renderOptions);
      if (isAggregateLevel(metric.level)) {
        selectParts.push(`${expression} AS ${outputAlias}`);
        continue;
      }
      const fns = aggregationFunctionsForColumn(aggregations, metric.outputName);
      if (fns.length === 0) {
        // Neither a key nor an aggregate here, so it would vanish from the query. A caller
        // rendering the grouping from an EMPTY rule list must drop such a plan rather than pass it:
        // a restriction one key coarser than the report keeps a different row set.
        throw new Error(
          `renderAggregatedSelect: '${metric.outputName}' is a row-level calculated field the ` +
            `report aggregates, but no aggregation rule reaching this call names it — pass the ` +
            `rules its grain was decided from, or filter the plan out with isCalculatedGroupingKey`
        );
      }
      for (const fn of fns) {
        const label = aggregatedColumnLabel(metric.outputName, fn);
        const alias = this.quoteIdentifier(label);
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
   * — parenthesised always, and cast to the analyst's DECLARED type when the function
   * does arithmetic on the value.
   *
   * The cast replaces an implicit coercion the warehouse was going to make anyway: a FLOAT-declared
   * formula returning text is legal, and Redshift coerces it to `Decimal` with scale 0, truncating
   * every row before summing.
   *
   * The INTEGER family is excluded although every dialect spells it, because there is no implicit
   * coercion to replace and the dialects disagree on direction — Spark truncates where the other
   * four round, so the same report would total differently per warehouse.
   *
   * Only the aggregation's argument, never the expression itself: the same formula also renders as
   * a GROUPING KEY that a metric sleeve reproduces outside this class and joins back on byte for
   * byte, and a cast one level down would leave that join-back matching nothing.
   */
  private renderAggregateArgument(
    fn: ReportAggregateFunction,
    expression: string,
    declaredType: string
  ): string {
    // Parenthesised: a formula body is arbitrary user SQL, and its top-level operator would
    // otherwise bind against the aggregate's own syntax.
    const argument = `(${expression})`;
    if (!NUMERIC_ARGUMENT_FUNCTIONS.has(fn)) return argument;
    if (isIntegerType(declaredType)) return argument;
    const castType = this.castTypeForDeclaredType(declaredType);
    return castType ? `CAST(${argument} AS ${castType})` : argument;
  }

  /**
   * `<expression> AS <alias>` per calculated field, for the PLAIN (non-aggregated) shape.
   *
   * Takes the WHOLE options object rather than a bare qualifier, because the plain BLENDED path
   * renders here too and resolves references through the join tree exactly as its grouped branch
   * does — so the same input gives the same SQL whether or not the report carries an aggregation.
   */
  renderCalculatedSelectItems(
    metrics: readonly CalculatedFieldPlan[] | undefined,
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
   */
  buildPlainSelectAliasResolver(
    metrics: readonly CalculatedFieldPlan[] | undefined,
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
   * — `CAST(<expr> AS <type>)`, built from the SAME two strings the filter's
   * left-hand side is built from, so the two can never name different values.
   *
   * Sorting IS comparison: keeping rows numerically and then ordering them as text returns
   * DIFFERENT ROWS under a LIMIT. Measured — `WHERE CAST(s AS <float>) > 5 ORDER BY s DESC LIMIT 2`
   * gave `9, 100` where `100, 10` is correct, on BigQuery, Athena, Redshift and Databricks alike.
   *
   * The EXPRESSION is repeated rather than the alias wrapped: `ORDER BY CAST(<alias> AS …)` fails
   * on Redshift with `column "v" does not exist`, because an output name is visible there only as a
   * bare ORDER BY term.
   *
   * A field the REPORT aggregates is excluded — its alias names the aggregate's value, not the
   * field's, and the bare row-level expression would be a non-grouping-key in an aggregated query.
   */
  buildCalculatedSortExpressions(
    metrics: readonly CalculatedFieldPlan[] | undefined,
    operands: ReadonlyMap<string, CalculatedPredicateOperand> | undefined,
    aggregations: AggregationRule[],
    opts: CalculatedFieldRenderOptions
  ): ReadonlyMap<string, string> {
    // A field is sortable if the report PROJECTS it or a filter NAMES it. The union is taken here
    // once, not by each dialect: `ORDER BY <text> DESC LIMIT 10` over a FLOAT-declared formula
    // returns a lexicographic top ten with no filter involved at all.
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
   * One calculated field's stored formula as SQL, and NOTHING about the query's grain. The single
   * render step every shape goes through, so an unparseable formula is reported the same way
   * whichever shape the query took. For the grouping-key promise use
   * `renderRowLevelDimensionExpression` instead.
   */
  private renderCalculatedFieldExpression(
    metric: CalculatedFieldPlan,
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
        undefined
      );
    } catch (e) {
      // Unguarded, the substitution recurses for ever — a stack overflow naming no field at all.
      // Refused before the string that would kill the pod is built, as a 400 naming the SELECTED
      // field, which is the only one the analyst can see.
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
      // A formula persisted before save-time validation existed can be unparseable, and the
      // composition-time validator only inspects calculated fields once the schema is actualized —
      // so without this the parse error surfaces as an uncaught 500 from Handlebars. Anything else
      // thrown here is a caller bug and keeps failing loudly as one.
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
   * another Calculated Field of the same Data Mart.
   *
   * Substitution happens at compose time only; nothing persists a substituted formula, which is
   * what makes editing a referenced formula reach every formula that reads it.
   *
   * A dependency is expanded PARENTHESISED: a formula body is arbitrary user SQL, so `x / a + b`
   * is valid and a different number from `x / (a + b)`.
   *
   * A dependency is expanded with NEITHER the caller's joined-reference resolver NOR its
   * replacement spans, so a joined reference inside one is refused rather than routed. That is
   * ACCESS CONTROL: routing and `assertAllRequestedSourcesAccessible` both read the SELECTED
   * metric's text, so a source reachable only through a dependency would be joined unchecked.
   */
  private expandCalculatedFormula(
    metric: CalculatedFieldPlan,
    opts: CalculatedFieldRenderOptions,
    closure: ReadonlyMap<string, CalculatedFieldPlan>,
    guard: FormulaExpansionGuard,
    /**
     * The field the REPORT selected, when `metric` is being substituted into it. No rendering
     * consequence: it exists so a refusal raised several hops down still names the field the
     * analyst put on the report.
     */
    selected: CalculatedFieldPlan | undefined
  ): string {
    const isDependency = selected !== undefined;
    // `ref.path` means nothing to THIS renderer — resolving it needs the join tree. The FLAT
    // renderer supplies neither channel, so it REFUSES a joined reference rather than guessing.
    const resolveReference =
      isDependency || !opts.resolveCalculatedFieldReference
        ? this.flatMetricReferenceResolver(metric, opts.qualifyColumn, selected)
        : opts.resolveCalculatedFieldReference;
    const replacements = isDependency
      ? []
      : (opts.calculatedFieldReplacements?.get(metric.outputName) ?? []);

    // LIVE references only. Substituting a commented-out tag splices a whole expression into a
    // comment, where its later lines escape onto live ones; and a commented tag naming the field it
    // sits in would refuse `b → b`, making a legal saved schema unrunnable by a loop that is not in
    // the SQL.
    let tokens: readonly SqlToken[] | undefined;
    const dependencyFor = (ref: FormulaReference): CalculatedFieldPlan | undefined => {
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
   * `SUM(x) -- note AS "a", SUM(y) AS "b"` reaches the warehouse as `SELECT SUM(x) SUM(y) AS "b"`.
   *
   * Applied at the one render step every WHOLE formula goes through, so the outer GROUP BY key and
   * the metric sleeve's projection of the same dimension stay byte-identical; applying it per call
   * site would break that.
   *
   * `--` only: no newline closes an unterminated block comment, and that SQL is already invalid.
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
   * projects and pushes into `groupByParts` for the same plan and options.
   *
   * Public because a metric sleeve CTE is built outside this class hierarchy and must project the
   * dimension the outer GROUP BY keys on, byte for byte, to join back on it. Two derivations stay
   * identical only until one changes, and the join-back then matches nothing — a NULL, or a
   * COALESCEd zero, rather than an error.
   *
   * NOT the whole key when the report buckets the field: what comes back is fed to
   * `renderDateTruncExpression` with the plan's declared type, in that order.
   */
  renderRowLevelDimensionExpression(
    plan: CalculatedFieldPlan,
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
   * The trimmed form of a string column used by `renderBlankFragment`. The bare
   * TRIM(col) strips all common whitespace on BigQuery, Athena and Snowflake, but
   * Redshift and Databricks strip ONLY the space character by default — those two
   * dialects override this so a tab/newline-only cell counts as blank on every
   * storage alike (space, tab, CR and LF are the normative blank set; BigQuery and
   * Athena additionally strip rarer Unicode whitespace, which is accepted slack).
   */
  protected blankTrimmedExpression(columnRef: string): string {
    return `TRIM(${columnRef})`;
  }

  /**
   * Renders the is_blank / is_not_blank pair — "the cell looks empty" (#6779).
   * Type-aware: a string column is blank when it is NULL, '' or whitespace-only
   * (see `blankTrimmedExpression` for the per-dialect trim form); any other type is
   * blank only when NULL — there is no empty number/date/boolean. When the column
   * type is unknown the NULL-only form is emitted: TRIM on a non-string column is a
   * type error on strict engines, so the safe default is the one that is valid SQL
   * everywhere. This branch is a last-resort defense — the report SQL composer
   * refuses blank filters outright when no schema types are available, so reaching
   * it means the single filtered column is absent from an otherwise known schema.
   */
  protected renderBlankFragment(
    operator: 'is_blank' | 'is_not_blank',
    columnRef: string,
    columnType?: string
  ): RenderedClause {
    const isString =
      columnType !== undefined && categorizeFieldType(columnType.trim().toUpperCase()) === 'string';
    const trimmed = this.blankTrimmedExpression(columnRef);
    if (operator === 'is_blank') {
      return {
        sql: isString ? `(${columnRef} IS NULL OR ${trimmed} = '')` : `${columnRef} IS NULL`,
        params: [],
      };
    }
    return {
      sql: isString
        ? `(${columnRef} IS NOT NULL AND ${trimmed} <> '')`
        : `${columnRef} IS NOT NULL`,
      params: [],
    };
  }

  /**
   * How a metric's reference becomes SQL when the caller supplied no resolver of its own — i.e. on
   * the FLAT path, which has no joined source to route to.
   *
   * An own-Data-Mart reference is just its qualified column. A JOINED one is REFUSED rather than
   * qualified against the main table, because guessing is wrong either way and one way is silent:
   * `main."amount"` is a perfectly valid read of the WRONG column when main happens to have one.
   *
   * LIVE references only, so commenting an old joined reference out does not make a metric
   * unrenderable.
   *
   * `selected` distinguishes the two shapes because they need different advice. For the selected
   * field, keeping the join is a real fix — the blended path lifts a joined call into a sleeve. For
   * a dependency substituted into it, it is not: a dependency is always expanded flat, so the
   * source is never joined for it however the report is built.
   */
  private flatMetricReferenceResolver(
    metric: CalculatedFieldPlan,
    qualify: ColumnRefResolver | undefined,
    selected?: CalculatedFieldPlan
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

  /** ORDER BY resolver for an aggregated query: column → its quoted output alias. */
  buildAggregatedAliasResolver(
    aliasByColumn: ReadonlyMap<string, string>,
    /**
     * From {@link buildCalculatedSortExpressions}, taking precedence over the alias. Required —
     * `undefined` must be a decision, not an omission.
     */
    sortCasts: ReadonlyMap<string, string> | undefined
  ): ColumnRefResolver {
    return col => sortCasts?.get(col) ?? aliasByColumn.get(col) ?? this.quoteIdentifier(col);
  }

  /**
   * Truncates a date/timestamp reference to a calendar bucket, converting to `timeZone` first when
   * one is set. The zone is a validated IANA name INLINED as a literal, not bound — see
   * IANA_TIME_ZONE_PATTERN, the injection guard. Every dialect MUST override this.
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
   * Public entry point for `renderDateTrunc`: a metric-sleeve CTE is built outside this class
   * hierarchy and must reproduce the IDENTICAL truncated expression the outer GROUP BY uses.
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
   * Assembled once rather than per dialect: five copies of the same sequence had already drifted —
   * the kept-groups restriction reached one builder with a column qualifier and three without, and
   * nothing in the type system objected.
   *
   * What differs per dialect is a parameter: `fromClause`, `qualifyColumn` (only BigQuery aliases
   * its source), the type maps. Everything else is fixed here, including the ORDER of the bound
   * params — positional dialects bind by position, so the array follows the placeholders in text
   * order, kept-groups first because its join precedes the outer WHERE.
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
     * How a PREDICATE refers to a column. Only a dialect whose FROM is aliased has one. Required —
     * `undefined` must be a decision, not an omission.
     */
    qualifyColumn: ColumnRefResolver | undefined;
    /**
     * How the PROJECTION and GROUP BY refer to a column, separate from `qualifyColumn`: BigQuery
     * qualifies its predicates but NOT its projection, where qualifying would force nested-RECORD
     * `AS` work. Required for the same reason.
     */
    qualifyProjection: ColumnRefResolver | undefined;
    /** Explicit `undefined` when the dialect has no field types — never silently omitted. */
    typeByColumn: ReadonlyMap<string, string> | undefined;
    /** Explicit `undefined` when the dialect inlines literals and needs no cast resolution. */
    resolveColumnType: ColumnTypeResolver | undefined;
    /** Calculated fields selected alongside `columns`; main-owner only. */
    calculatedFields?: readonly CalculatedFieldPlan[];
    /**
     * `buildCalculatedPredicateExpressions` over every Calculated Field a FILTER may name, selected
     * or not. Built by the dialect builder, whose plain branch needs the same map.
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
        calculatedFields: opts.calculatedFields,
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
    // Which clause a filter belongs in comes off the rule's carried clause, never from
    // `rule.function`. The projection's own aggregate arguments travel with them, so a filter
    // compares the string the SELECT prints rather than a second rendering of it.
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
    // expression its filter compares.
    const orderBy = this.renderOrderBy(
      opts.sort,
      this.buildAggregatedAliasResolver(
        agg.aliasByColumn,
        this.buildCalculatedSortExpressions(
          opts.calculatedFields,
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
   * Totals have no GROUP BY, so the report's HAVING filters cannot apply there, and dropping them
   * makes Totals summarise rows the report hides. Re-running the grouping as a derived table and
   * joining it filters rows without duplicating any, and every metric is then computed over the
   * surviving ROWS — which is what keeps a symmetric aggregate right, where summing per-group
   * values would not.
   *
   * Empty clause when the report has no metric filter, so the SQL is unchanged.
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
    // Only a GROUPING KEY contributes a key. `dimensions` is rebuilt from the same filtered array
    // rather than taken as given: the positional pairing below indexes the two together, and an
    // off-by-one there is a wrong number, not an error.
    const calculatedDimensions = (restriction.calculatedDimensions ?? []).filter(
      isCalculatedGroupingKey
    );
    const calculatedNames = new Set(calculatedDimensions.map(metric => metric.outputName));
    const columnDimensions = restriction.dimensions.filter(name => !calculatedNames.has(name));
    const dimensions = [...columnDimensions, ...calculatedDimensions.map(m => m.outputName)];
    // No metrics: HAVING renders its own aggregate expressions, so the subquery carries the
    // dimension tuple alone. Passing no aggregation rules is also what makes every dimension a key.
    const grouped = this.renderAggregatedSelect(
      columnDimensions,
      [],
      buildDateTruncUnitMap(dateTruncs),
      {
        qualifyColumn: opts.qualifyColumn,
        timeZoneByColumn: buildTimeZoneMap(dateTruncs),
        typeByColumn: opts.typeByColumn,
        calculatedFields: calculatedDimensions.length > 0 ? calculatedDimensions : undefined,
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
    // Nothing here renders the aggregate the report printed, so there is no
    // `aggregateArgumentByLabel` to pass on — it is built from the restriction's own plans, through
    // the same seats the projection used, with the PREDICATE qualifier matching the keys above.
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
   * NULL-safe equality for a dimension-tuple join, so a metric sleeve joins back without dropping
   * NULL-dimension buckets. BigQuery and Athena have no portable IS NOT DISTINCT FROM.
   *
   * Each side is parenthesised because a grouping key can be a whole formula, and Redshift binds
   * `=` tighter than `||`: a bare `a || b = k` parses as `a || (b = k)` and the join is rejected —
   * silently, since Totals are best-effort and the analyst just loses the block.
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
   * Hook for a dialect-specific invariant check on a rendered fragment. Positional dialects
   * override it to assert placeholder count equals params.length: a wrong count silently misaligns
   * every subsequent value.
   */
  protected validateFragment(_clause: RenderedClause): void {
    // no-op by default; named-parameter dialects (BigQuery `@name`) may reuse a
    // name across placeholders, so occurrence count need not equal params.length.
  }

  /**
   * IN/NOT IN for param-binding dialects: one placeholder and one param per value, names advanced
   * sequentially so positional binders stay aligned.
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
   * Null-inclusive `NOT IN`: SQL `NOT IN` drops NULLs, but "is none of" should keep rows where the
   * column is missing. Matches the null-inclusive `neq` / `not_contains` operators.
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
