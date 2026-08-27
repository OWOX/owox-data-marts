import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { isCountingFormulaFunction } from '../../calculated-fields/formula-function-dialect';
import { SqlToken, scanSql } from '../../calculated-fields/sql-token-scanner';
import {
  ReportAggregateFunction,
  VALUE_SLEEVE_FUNCTIONS,
  sleeveShapeFor,
} from '../../dto/schemas/aggregate-function.schema';
import { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import { aggregatedColumnLabel } from '../../dto/schemas/aggregation-labels';
import {
  BlendedFieldEntry,
  BlendedQueryContext,
  JoinedUniqueCountSleeve,
  ResolvedRelationshipChain,
} from '../interfaces/blended-query-builder.interface';
import {
  CalculatedPredicateOperand,
  ColumnRefResolver,
  ColumnTypeResolver,
  SqlParameter,
} from '../utils/sql-clause-renderer';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { DateTruncUnit } from '../../dto/schemas/date-trunc-config.schema';
import { buildOptionalDateTruncUnitMap, buildTimeZoneMap } from '../utils/date-trunc-maps.utils';
import { sanitizeSqlComment } from './sql-comment.utils';
import { sleeveDimensionAlias } from '../utils/kept-groups.utils';
import {
  renderPrimaryKeyCountedSlotRef,
  renderPrimaryKeyIdentitySlots,
} from '../utils/primary-key-identity.utils';
import { BlendedSqlDialect, createColumnQualifier, renderLeftJoinOn } from './blended-sql-dialect';
import {
  FormulaSleeveGroup,
  NO_SLEEVE_FILTERS,
  ROW_SURROGATE_ALIAS,
  SleeveCalculatedDimensions,
  SleeveFilterOptions,
  SleevePull,
  SleeveResult,
  ValueSleeveGroup,
} from './blended-query.types';
import {
  collectReportDimensions,
  disambiguateSleeveCteNames,
  type FormulaSleevePlan,
  groupCountDistinctMetrics,
  groupValueSleeveMetrics,
  identityScopingJoinKeyColumns,
  isIdentityPreJoinField,
  resolveCountDistinctGroupCteName,
  resolveValueSleeveGroupCteName,
  sleeveCteNameForColumn,
  sleeveJoinColumns,
  splitValueSleeveGroupsByIdentity,
  uniqueCountSleeveCteName,
  valueSleeveIdentityFor,
} from './metric-sleeve.planner';
import { isCalculatedGroupingKey } from '../../calculated-fields/calculated-plan-grain';

/**
 * Every table qualifier `sql` reads a COLUMN through: the leading segment of each dotted chain that
 * is not a function call. Lexical, over `scanSql`, so `WHEN status = 'a.b'` is not a reference.
 *
 * NOT qualifiers: a middle segment (`orders_raw.address.city` names one table) and a namespace
 * before a call (`SAFE.DIVIDE(a, b)`), told apart by the `(` that follows.
 *
 * Bare unqualified names are out of reach by construction — nothing distinguishes a column `amount`
 * from the keyword `END` without parsing the dialect's grammar. A stated limit, not an oversight.
 */
function columnQualifiersIn(sql: string): string[] {
  const tokens = scanSql(sql).filter(t => t.kind !== 'comment');
  const isName = (t?: SqlToken): boolean => t?.kind === 'word' || t?.kind === 'quotedIdentifier';
  const qualifiers: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!isName(tokens[i]) || tokens[i + 1]?.value !== '.') continue;
    let last = i;
    while (tokens[last + 1]?.value === '.' && isName(tokens[last + 2])) last += 2;
    if (tokens[last + 1]?.value !== '(') qualifiers.push(unquoteIdentifier(tokens[i].value));
    // Skip the chain's own middle segments; only its FIRST segment can name a table.
    i = last;
  }
  return Array.from(new Set(qualifiers.map(q => q.toLowerCase())));
}

/** A doubled delimiter escapes itself, as `scanSql` reads it; an unterminated literal has no closer. */
function unquoteIdentifier(value: string): string {
  const delim = value[0];
  if (delim !== '"' && delim !== '`') return value;
  const closed = value.length > 1 && value.endsWith(delim);
  return value
    .slice(1, closed ? -1 : undefined)
    .split(delim + delim)
    .join(delim);
}

/**
 * Emits the SQL for one metric sleeve: a CTE that re-joins `main` with the RAW
 * (pre-dedup) chain CTEs and recomputes a joined COUNT DISTINCT / SUM / AVG at the report's
 * own dimension grain, instead of re-aggregating the parent-key dedup CTE — which over- or
 * under-counts whenever the join fans out.
 *
 * Which sleeves exist, who owns them and what they are called is decided upstream by
 * `metric-sleeve.planner.ts`; this class only turns one such decision into SQL. It needs the
 * warehouse dialect (identifier quoting, aggregate spelling, the clause renderer) and nothing
 * else about the builder, so it takes a `BlendedSqlDialect` port.
 */
export class MetricSleeveBuilder {
  private readonly dateTruncMaps = new WeakMap<
    object,
    { units?: ReadonlyMap<string, DateTruncUnit>; zones?: ReadonlyMap<string, string> }
  >();

  constructor(private readonly dialect: BlendedSqlDialect) {}

  /**
   * Plans and builds every sleeve CTE one aggregated report needs, in WITH-clause order.
   *
   * Names are resolved across the FULL set BEFORE any SQL is built: the final name is baked
   * into each CTE's text and into its `dimRefs`, so a late rename would desynchronise the
   * join-back. Each sleeve also gets a UNIQUE bound-param prefix, which is what keeps
   * positional (Athena `?`) binding aligned once the same report filter is rendered inside
   * several sleeves as well as in the outer query.
   */
  buildAll(
    sleeveMetrics: AggregationRule[],
    context: BlendedQueryContext,
    opts: {
      outputAliasToRoot: ReadonlyMap<string, string>;
      filters: FilterRule[];
      resolveColumnType?: ColumnTypeResolver;
      keptGroups?: { join: string; dimensions: string[] };
      /**
       * One entry per JOINED aggregate call of a calculated field's formula, planned by
       * `planFormulaSleeves`. `valueSql` is that call's argument already rendered against the owner
       * — the caller owns ref resolution and the classification `isIdentity` records, because only
       * it can see which fields the expression reads.
       */
      formulaSleeves?: ReadonlyArray<{
        plan: FormulaSleevePlan;
        valueSql: string;
        isIdentity: boolean;
      }>;
      /**
       * The calculated fields that are GROUPING KEYS of the report — dimensions like any
       * other, except that they have no column name to qualify, so the expression travels beside
       * the grain instead of in it. See `SleeveCalculatedDimensions`.
       */
      calculatedDimensions?: SleeveCalculatedDimensions;
      /**
       * The left-hand side of a predicate on any Calculated Field a filter may name, selected or
       * not — see `SleeveFilterOptions.calculatedExpressions`. Separate from
       * `calculatedDimensions.plans`, which holds SELECTED grouping keys only: a field that is
       * FILTERED but not selected has no plan there and would otherwise reach no sleeve at all.
       */
      calculatedExpressions?: ReadonlyMap<string, CalculatedPredicateOperand>;
    }
  ): SleeveResult[] {
    const { outputAliasToRoot, filters, resolveColumnType, keptGroups, calculatedDimensions } =
      opts;
    // The grain below is built from these plans alone, so one that is NOT a grouping key widens
    // every sleeve past the outer GROUP BY and its join-back matches nothing.
    // Asserted here, ahead of the caller's own count and membership checks, because those only run
    // once a sleeve exists — a blended report with no sleeve reaches neither.
    for (const [name, plan] of calculatedDimensions?.plans ?? []) {
      if (!isCalculatedGroupingKey(plan)) {
        throw new Error(
          `buildAll: calculated dimension '${name}' (level '${plan.level}') is not a grouping key ` +
            `of the report — filter the plans through isCalculatedGroupingKey before handing them ` +
            `to the sleeves, or their grain is finer than the outer query's`
        );
      }
    }
    // --- Sleeve metrics: a joined COUNT_DISTINCT is computed in a separate CTE that
    // re-joins the raw (pre-dedup) path and counts distinct at the report dimension
    // grain — NOT via the normal dedup-then-SUM re-aggregation, which over-counts.
    const dimensions = collectReportDimensions(context.columns, context.aggregations ?? [], [
      ...(calculatedDimensions?.plans.keys() ?? []),
    ]);
    // COUNT_DISTINCT sleeves stay ONE-CTE-PER-METRIC — their single-level
    // `COUNT(DISTINCT col)` dedup shape differs from a value sleeve's nested
    // DISTINCT-then-aggregate form, so they never merge with a value sleeve.
    const countDistinctSleeveMetrics = sleeveMetrics.filter(
      m => sleeveShapeFor(m.function) === 'count-distinct'
    );
    // Value sleeves on the SAME owner chain + column + dimensions merge into ONE dedup pass.
    const valueSleeveMetrics = sleeveMetrics.filter(m => sleeveShapeFor(m.function) === 'value');
    // A metric with no shape would vanish silently: excluded from the aggregated SELECT, yet no
    // sleeve CTE built for it, so its header binds to nothing.
    const routedSleeveMetrics = countDistinctSleeveMetrics.length + valueSleeveMetrics.length;
    if (routedSleeveMetrics !== sleeveMetrics.length) {
      const unhandled = sleeveMetrics.filter(m => sleeveShapeFor(m.function) === null);
      throw new Error(
        `buildAll: function(s) ` +
          `[${unhandled.map(m => `${m.column}:${m.function}`).join(', ')}] were passed as sleeve ` +
          `metrics but carry no sleeve shape in SLEEVE_ROUTING — give the function a shape ` +
          `there (and a branch here, if it needs a new one) before routing it through a sleeve`
      );
    }
    // split any group that mixes an identity (ANY_VALUE) field with a non-identity pre-join
    // aggregate field back into single-shape sub-groups — see `splitValueSleeveGroupsByIdentity`.
    const valueSleeveGroups = splitValueSleeveGroupsByIdentity(
      groupValueSleeveMetrics(
        valueSleeveMetrics.map(m => ({ metric: m, dimensions })),
        context.fieldIndex
      ),
      context
    );

    // Plan every sleeve's INTENDED base name, then disambiguate across the FULL set (COUNT_DISTINCT
    // sleeves, value groups and joined Unique Counts) BEFORE building any SQL — the final name is
    // baked into each CTE's SQL and dimRefs, so it must be resolved up front.
    // A COUNT_DISTINCT and a SUM/AVG value sleeve CAN target the same joined
    // column (governance's offered menu forbids it, but a stale/crafted blended
    // `postJoinAggregations` override bypasses that — buildAggregationGovernance does not
    // clamp it), both wanting the bare `sleeve_<col>` name. The guard renames the collision
    // instead of emitting a duplicate CTE name the warehouse rejects. Order is deterministic:
    // COUNT_DISTINCT sleeves first (bare names kept), then value groups.
    // Which COUNT_DISTINCT metrics share one CTE, and what it is called, are decided by the
    // planner — like every other sleeve-shape decision.
    const countDistinctGroups = groupCountDistinctMetrics(
      countDistinctSleeveMetrics,
      context.fieldIndex
    );

    const sleevePlans: {
      baseName: string;
      build: (finalName: string, filterOpts: SleeveFilterOptions) => SleeveResult;
    }[] = [
      ...countDistinctGroups.map(group => ({
        baseName: resolveCountDistinctGroupCteName(group),
        build: (finalName: string, filterOpts: SleeveFilterOptions): SleeveResult => {
          const built = this.buildSleeveCte(
            group.metrics[0],
            dimensions,
            context,
            outputAliasToRoot,
            finalName,
            filterOpts,
            group.metrics,
            calculatedDimensions
          );
          return {
            cteName: built.cteName,
            dimRefs: built.dimRefs,
            sql: built.sql,
            pulls: built.pulls,
            params: built.params,
          };
        },
      })),
      ...valueSleeveGroups.map(group => ({
        baseName: resolveValueSleeveGroupCteName(group),
        build: (finalName: string, filterOpts: SleeveFilterOptions): SleeveResult => {
          if (group.metrics.length === 1) {
            // Singleton group (the common case: one SUM or one AVG alone) — reuse
            // buildSleeveCte directly so the CTE stays the exact bare `sleeve_<col>` shape
            // its own unit tests pin, byte-identical to the pre-C3.1 SQL for this case.
            const built = this.buildSleeveCte(
              group.metrics[0],
              group.dimensions,
              context,
              outputAliasToRoot,
              finalName,
              filterOpts,
              undefined,
              calculatedDimensions
            );
            return {
              cteName: built.cteName,
              dimRefs: built.dimRefs,
              sql: built.sql,
              pulls: built.pulls,
              params: built.params,
            };
          }
          return this.buildValueSleeveGroupCte(
            group,
            context,
            outputAliasToRoot,
            finalName,
            filterOpts,
            calculatedDimensions
          );
        },
      })),
      // Joined Unique Count sleeves come LAST so adding one cannot shift an existing sleeve's
      // disambiguated name or its `slv<i>p` param prefix.
      ...(context.uniqueCountSources ?? []).map(source => ({
        baseName: uniqueCountSleeveCteName(source),
        build: (finalName: string, filterOpts: SleeveFilterOptions): SleeveResult =>
          this.buildUniqueCountSleeveCte(
            source,
            dimensions,
            context,
            outputAliasToRoot,
            finalName,
            filterOpts,
            calculatedDimensions
          ),
      })),
      // Formula sleeves come after even those, for the same reason: selecting a calculated field
      // must not rename another sleeve's CTE or shift its bound-parameter prefix.
      ...(opts.formulaSleeves ?? []).map(({ plan, valueSql, isIdentity }) => ({
        baseName: plan.baseCteName,
        build: (finalName: string, filterOpts: SleeveFilterOptions): SleeveResult => ({
          ...this.buildFormulaSleeveCte(
            {
              ownerCteName: plan.ownerCteName,
              dimensions,
              fn: plan.call.fn,
              distinct: plan.distinct,
              isIdentity,
              valueSql,
              alias: plan.pullAlias,
              metricOutputName: plan.metricOutputName,
            },
            context,
            outputAliasToRoot,
            finalName,
            filterOpts,
            calculatedDimensions
          ),
          formulaCall: { metricOutputName: plan.metricOutputName, callIndex: plan.callIndex },
        }),
      })),
    ];
    const finalSleeveNames = disambiguateSleeveCteNames(
      sleevePlans.map(p => p.baseName),
      context.chains
    );
    // each sleeve reproduces the report's post-join WHERE inside its own subquery.
    // A UNIQUE param prefix per sleeve keeps named-parameter dialects from colliding when the
    // same filter is rendered in several sleeves plus the outer query.
    return sleevePlans.map((p, i) =>
      p.build(finalSleeveNames[i], {
        filters,
        resolveColumnType,
        whereParamPrefix: `slv${i}p`,
        keptGroups,
        calculatedExpressions: opts.calculatedExpressions,
      })
    );
  }

  /**
   * Raw ref for a column INSIDE a sleeve subquery: `main.<col>` for a main-native column, or
   * `<cte>_raw.<rawField>` for a blended (joined) column. Shared by every sleeve builder so the
   * COUNT_DISTINCT and value-sleeve paths resolve columns identically and cannot drift.
   */
  sleeveRawRef(
    column: string,
    fieldIndex: ReadonlyMap<string, BlendedFieldEntry>,
    outputAliasToRoot: ReadonlyMap<string, string>
  ): { ref: string; cteName?: string } {
    const entry = fieldIndex.get(column);
    if (entry && outputAliasToRoot.has(column)) {
      return {
        ref: `${this.dialect.quoteIdentifier(`${entry.cteName}_raw`)}.${this.dialect.quoteFieldRef(entry.originalFieldName)}`,
        cteName: entry.cteName,
      };
    }
    return { ref: `${this.dialect.quoteIdentifier('main')}.${this.dialect.quoteFieldRef(column)}` };
  }

  /**
   * The `LEFT JOIN <cte>_raw ON ...` clauses a sleeve subquery needs: the ancestor closure
   * (via `chain.parentAlias`) of every seed CTE (the metric owner(s) + each dimension's owning
   * CTE), ordered parents-before-children (`context.chains` is depth-sorted, so filtering
   * preserves that order). Extracted so the COUNT_DISTINCT sleeve (`buildSleeveCte`) and the
   * merged value sleeve (`buildValueSleeveGroupCte`) share ONE ancestor-join implementation and
   * cannot drift (1 review — DRY).
   */
  buildSleeveAncestorJoins(
    seedCteNames: ReadonlyArray<string | undefined>,
    context: BlendedQueryContext
  ): string[] {
    const chainByCte = new Map(context.chains.map(c => [c.cteName, c]));
    const neededCtes = new Set<string>();
    const addWithAncestors = (cte?: string): void => {
      let c = cte;
      // `neededCtes` doubles as the visited set: a `parentAlias` cycle (A's parent is B, B's is
      // A) would otherwise spin this loop forever and hang the request thread with no error.
      // The chain tree is acyclic by construction today — this costs one comparison to make
      // sure a future relationship-resolution bug surfaces as a wrong query, not a hung worker.
      while (c && chainByCte.has(c) && !neededCtes.has(c)) {
        neededCtes.add(c);
        const parentAlias = chainByCte.get(c)!.parentAlias;
        c = parentAlias === 'main' ? undefined : parentAlias;
      }
    };
    for (const seed of seedCteNames) addWithAncestors(seed);

    return context.chains
      .filter(c => neededCtes.has(c.cteName))
      .map(c => {
        const parentRaw = c.parentAlias === 'main' ? 'main' : `${c.parentAlias}_raw`;
        return renderLeftJoinOn(this.dialect, {
          leftAlias: parentRaw,
          rightAlias: `${c.cteName}_raw`,
          joinConditions: c.relationship.joinConditions,
          indent: '    ',
        });
      });
  }

  /**
   * The `LEFT JOIN <root> ON …` clauses a sleeve subquery needs so a BLENDED dimension or post-join
   * filter column resolves through the SAME `qualifyColumn` ref the OUTER query uses, making the
   * sleeve's projected dimension and the outer GROUP BY byte-identical by construction. Otherwise a
   * fanning dimension's roll-up (STRING_AGG → 'A, B') disagrees with the raw value the sleeve
   * projects, and the join-back never matches.
   *
   * One join per DISTINCT root chain; a main-native column needs none. These dedup CTEs are 1:1
   * with `main`, so joining them adds no fan-out — the raw CTEs remain the sole identity source.
   */
  buildSleeveDedupRootJoins(
    columns: readonly string[],
    outputAliasToRoot: ReadonlyMap<string, string>,
    context: BlendedQueryContext
  ): string[] {
    const roots = new Set<string>();
    for (const col of columns) {
      const root = outputAliasToRoot.get(col);
      if (root) roots.add(root);
    }
    return context.chains
      .filter(c => roots.has(c.cteName))
      .map(c => this.buildChainDedupJoinLine(c));
  }

  /**
   * The `LEFT JOIN <chain.cteName> ON <parent>.<src> = <chain.cteName>.<tgt>` line for ONE
   * chain's own dedup CTE, keyed to ITS OWN `relationship.joinConditions` (the parent-join-key
   * that CTE's `GROUP BY` collapses to one row per). `<parent>` is `main` for a root chain or
   * `<parentAlias>_raw` for a nested one — the same "attach to the parent's RAW row" shape
   * `buildJoinedCte` uses for the normal (non-sleeve) bottom-up tree. Shared by
   * `buildSleeveDedupRootJoins` (dimension/filter columns, root chains only) and the
   * non-identity value-sleeve owner join (which may be a NESTED chain) so both emit the
   * identical join shape and cannot drift.
   */
  buildChainDedupJoinLine(chain: ResolvedRelationshipChain): string {
    const parent = chain.parentAlias === 'main' ? 'main' : `${chain.parentAlias}_raw`;
    return renderLeftJoinOn(this.dialect, {
      leftAlias: parent,
      rightAlias: chain.cteName,
      joinConditions: chain.relationship.joinConditions,
      indent: '    ',
    });
  }

  // renders the report's post-join WHERE INSIDE a sleeve subquery, over the SAME
  // `qualify` resolver the outer query uses (main-native → `main.<col>`, blended → the dedup
  // CTE `<root>.<col>` joined via `buildSleeveDedupRootJoins`). Returns `{ sql: '', params: [] }`
  // when there is nothing to apply. `renderWhere` already skips every rule whose carried clause
  // is HAVING — no sleeve template emits a HAVING at all.
  //
  // `calculatedExpressions` is the LAST argument for the same reason it is on the outer call: a
  // rule naming a Calculated Field compares that field's formula, not a column.
  renderSleeveWhere(
    filterOpts: SleeveFilterOptions,
    qualify: ColumnRefResolver
  ): { sql: string; params: SqlParameter[] } {
    const renderer = this.dialect.clauseRenderer();
    if (filterOpts.filters.length === 0 || !renderer) return { sql: '', params: [] };
    return renderer.renderWhere(
      filterOpts.filters,
      qualify,
      filterOpts.whereParamPrefix,
      filterOpts.resolveColumnType,
      filterOpts.calculatedExpressions
    );
  }

  /**
   * ONE merged value-sleeve CTE for a group of SUM/AVG metrics sharing an owner chain and
   * dimensions: a single inner `SELECT DISTINCT (dims, owner identity, value slots)` pass, wrapped
   * by an outer SELECT computing each metric's aggregate over its own slot.
   *
   * Metrics on the SAME column (SUM + AVG of one field) share ONE slot, since the dedup set is
   * identical. The planner no longer forms a group spanning DIFFERENT columns: `DISTINCT` covers
   * the whole tuple, so a second column's variation keeps apart rows the first means to collapse.
   *
   * The identity and value legs branch on `isIdentityPreJoinField`.
   * `splitValueSleeveGroupsByIdentity` guarantees one classification per group, so the check here
   * is a defensive invariant rather than a routing decision.
   */
  buildValueSleeveGroupCte(
    group: ValueSleeveGroup,
    context: BlendedQueryContext,
    outputAliasToRoot: ReadonlyMap<string, string>,
    cteName: string,
    filterOpts: SleeveFilterOptions = NO_SLEEVE_FILTERS,
    calculatedDimensions?: SleeveCalculatedDimensions
  ): SleeveResult {
    const computes = group.metrics.map(m => `${m.function}(${m.column})`).join(', ');
    const fieldIndex = context.fieldIndex;
    if (!fieldIndex) {
      throw new Error(
        `buildValueSleeveGroupCte: context.fieldIndex is required to resolve value-sleeve ` +
          `metric(s) [${computes}] ` +
          `for owner cteName='${group.ownerCteName}'`
      );
    }
    const identityFlags = new Set(
      group.metrics.map(m => isIdentityPreJoinField(m.column, fieldIndex, context))
    );
    if (identityFlags.size > 1) {
      throw new Error(
        `buildValueSleeveGroupCte: owner cteName='${group.ownerCteName}' mixes an identity ` +
          `(ANY_VALUE) pre-join field with a non-identity one in the SAME group ` +
          `[${computes}] — ` +
          `splitValueSleeveGroupsByIdentity must separate them before calling this method`
      );
    }
    // An empty set means the group carries no metrics at all — nothing to aggregate, so the CTE
    // would emit a dedup subquery with no aggregate over it. It defaulted to `identity` and built
    // that CTE anyway; the planner never produces such a group, so say so rather than emit it.
    if (identityFlags.size === 0) {
      throw new Error(
        `buildValueSleeveGroupCte: value-sleeve group for owner cteName=` +
          `'${group.ownerCteName}' carries no metrics — a sleeve with nothing to aggregate ` +
          `cannot be built`
      );
    }
    const isIdentity = identityFlags.has(true);

    // One dedup slot per DISTINCT value column in the group — metrics sharing a column (SUM +
    // AVG of the same field) read the SAME slot, so it's deduped exactly once regardless of
    // how many outer aggregates consume it. Identity reads the RAW column; non-identity reads
    // the owner dedup CTE's OWN already-aggregated column (`<ownerCteName>.<outputAlias>` —
    // e.g. `hits.hits__hitId`, the `COUNT(DISTINCT hitId)` per session), NOT the raw column
    // ( — the defect this method exists to fix: summing raw ids instead of summing the
    // per-group pre-join aggregate).
    const distinctColumns = Array.from(new Set(group.metrics.map(m => m.column)));
    const valueSlotByColumn = new Map(
      distinctColumns.map((col, i) => [col, distinctColumns.length === 1 ? '_val' : `_val_${i}`])
    );
    const slots = distinctColumns.map(col => ({
      alias: valueSlotByColumn.get(col)!,
      sql: isIdentity
        ? this.sleeveRawRef(col, fieldIndex, outputAliasToRoot).ref
        : `${this.dialect.quoteIdentifier(group.ownerCteName)}.${this.dialect.quoteIdentifier(col)}`,
    }));

    const pulls: SleevePull[] = [];
    const outerAggItems = group.metrics.map(m => {
      // `ValueSleeveGroup.metrics` is typed as the broader `AggregationRule[]`.
      if (!VALUE_SLEEVE_FUNCTIONS.has(m.function)) {
        throw new Error(
          `buildValueSleeveGroupCte: value-sleeve group metric column='${m.column}' has ` +
            `function='${m.function}', which SLEEVE_ROUTING does not give the 'value' shape ` +
            `(only dedup-then-aggregate functions belong in a value-sleeve group)`
        );
      }
      const slot = valueSlotByColumn.get(m.column)!;
      const alias = aggregatedColumnLabel(m.column, m.function);
      pulls.push({ metric: m, alias, coalesceEmptyToZero: false });
      return `${this.dialect.buildAggregation(m.function, this.dialect.quoteIdentifier(slot))} AS ${this.dialect.quoteIdentifier(alias)}`;
    });

    return this.buildDedupValueSleeveCte({
      caller: 'buildValueSleeveGroupCte',
      computes,
      ownerCteName: group.ownerCteName,
      dimensions: group.dimensions,
      cteName,
      isIdentity,
      slots,
      outer: { items: outerAggItems, pulls },
      context,
      outputAliasToRoot,
      filterOpts,
      calculatedDimensions,
    });
  }

  /**
   * One aggregate call of a calculated field's formula, computed by its OWN sleeve: `fn(<valueSql>)`
   * recomputed at the report's dimension grain over the owner's RAW rows. Same shape as a value
   * sleeve, except the inner slot holds a rendered EXPRESSION rather than a column reference.
   *
   * `group.isIdentity` picks the same two branches the value sleeve has: a joined field's declared
   * pre-join `aggregateFunction` is what that field MEANS once blended, so a single reference to a
   * funnel-shaped field reads the rolled-up column off `<owner>`. Raw is the default, and the only
   * option for a row-level expression over several of the owner's columns.
   *
   * That the expression reads ONLY the owner is ENFORCED, not assumed: `main` and the ancestor
   * closure are in scope while the inner DISTINCT keys on the owner's identity alone, so a call
   * mixing in a main column keeps N rows apart per owner row and multiplies the aggregate by N,
   * silently. QUALIFIED references only — an unqualified name in `valueSql` means the renderer is
   * broken, not the formula.
   */
  buildFormulaSleeveCte(
    group: FormulaSleeveGroup,
    context: BlendedQueryContext,
    outputAliasToRoot: ReadonlyMap<string, string>,
    cteName: string,
    filterOpts: SleeveFilterOptions = NO_SLEEVE_FILTERS,
    calculatedDimensions?: SleeveCalculatedDimensions
  ): SleeveResult {
    // `buildAggregation`'s dialect-specific branches match on the exact spelling, so an
    // un-normalised name would silently fall through to the generic `<fn>(<slot>)` form.
    const fn = group.fn.trim().toUpperCase();
    if (fn.length === 0 || group.valueSql.trim().length === 0 || group.alias.trim().length === 0) {
      throw new Error(
        `buildFormulaSleeveCte: formula sleeve '${cteName}' on owner ` +
          `cteName='${group.ownerCteName}' has an empty fn='${group.fn}', ` +
          `valueSql='${group.valueSql}' or alias='${group.alias}' — each one renders straight ` +
          `into the CTE, so an empty piece emits SQL the warehouse rejects`
      );
    }
    const isIdentity = group.isIdentity ?? true;
    // The one alias the expression may read: the owner's raw rows, or — when the value is a
    // pre-join roll-up — the owner's own dedup CTE, which is where that roll-up lives.
    const ownerAlias = isIdentity ? `${group.ownerCteName}_raw` : group.ownerCteName;
    const foreignQualifiers = columnQualifiersIn(group.valueSql).filter(
      q => q !== ownerAlias.toLowerCase()
    );
    if (foreignQualifiers.length > 0) {
      // USER DATA — a formula saved before the owner-mixing gate existed, or one a re-homed field
      // silently turned into a mixed-owner call. Refusing is the only safe answer: the alternative
      // is a number multiplied by the fan-out with nothing to show it went wrong.
      // Named for the analyst, not for the builder: `group.alias` is the synthetic pull name
      // `_fx_<metric>_<i>`, which exists nowhere in their schema. The payload carries
      // `calculatedField` for the same reason every sibling refusal does — it is the key the MCP
      // and web error paths read to point at a field.
      const named = group.metricOutputName ?? group.alias;
      throw new BusinessViolationException(
        `The calculated field '${named}' aggregates over joined source ` +
          `'${group.ownerCteName}' but its expression also reads ` +
          `[${foreignQualifiers.join(', ')}]. One aggregate call must read a single source, or ` +
          `its result is multiplied by the join's fan-out. Split it into one call per source`,
        { calculatedField: named, foreignQualifiers }
      );
    }
    if (group.distinct && fn !== 'COUNT') {
      throw new Error(
        `buildFormulaSleeveCte: formula sleeve '${cteName}' carries a DISTINCT quantifier on ` +
          `'${fn}', but only COUNT has an outer spelling for it — planFormulaSleeves refuses the ` +
          `rest, so reaching here means a caller built the group itself`
      );
    }
    const slotAlias = '_val';
    const slotRef = this.dialect.quoteIdentifier(slotAlias);
    // `COUNT_DISTINCT` is the report picklist's spelling of the same thing, and every dialect
    // already spells it — reusing it keeps one definition of `COUNT(DISTINCT …)` per warehouse.
    const outerFn = group.distinct ? 'COUNT_DISTINCT' : fn;
    return this.buildDedupValueSleeveCte({
      caller: 'buildFormulaSleeveCte',
      computes: `${fn}(${group.distinct ? 'DISTINCT ' : ''}${group.valueSql})`,
      ownerCteName: group.ownerCteName,
      dimensions: group.dimensions,
      cteName,
      isIdentity,
      slots: [{ alias: slotAlias, sql: group.valueSql }],
      outer: {
        // A formula may spell any aggregate ITS warehouse offers (`FormulaFunctionDialect`), not
        // the report builder's closed picklist; `buildAggregation` spells the ones it knows per
        // dialect and renders the rest verbatim.
        items: [
          `${this.dialect.buildAggregation(outerFn as ReportAggregateFunction, slotRef)} AS ${this.dialect.quoteIdentifier(group.alias)}`,
        ],
        pulls: [{ alias: group.alias, coalesceEmptyToZero: isCountingFormulaFunction(fn) }],
      },
      context,
      outputAliasToRoot,
      filterOpts,
      calculatedDimensions,
    });
  }

  /**
   * The dedup-then-aggregate CTE that every value-shaped sleeve IS: an inner
   * `SELECT DISTINCT (dims, owner identity, value slot(s))` over the raw (pre-dedup) path,
   * wrapped by an outer aggregate per slot.
   *
   * Its two callers decide only WHAT the slots hold and HOW they are aggregated. Everything else —
   * the two join sets, the dimension expressions, the owner-identity leg, the reproduced WHERE and
   * the kept-groups semi-join — is identical and must stay so: a sleeve that resolved any of them
   * differently would aggregate over a different row set than the query it feeds.
   */
  private buildDedupValueSleeveCte(spec: {
    /** The public method that asked for this CTE, quoted back in the guards' messages. */
    caller: string;
    /** What this sleeve computes (`SUM(col), AVG(col)`), for those guards and the CTE's comment. */
    computes: string;
    ownerCteName: string;
    dimensions: string[];
    cteName: string;
    /**
     * Whether the value is read off the owner's RAW rows — its raw ancestor closure is then the
     * fan-out identity source — or off the owner's own dedup CTE. See the two branches below.
     */
    isIdentity: boolean;
    /** The inner `SELECT DISTINCT`'s value slots, in emission order. */
    slots: { alias: string; sql: string }[];
    /** The outer aggregates over those slots, and the output columns they feed. */
    outer: { items: string[]; pulls: SleevePull[] };
    context: BlendedQueryContext;
    outputAliasToRoot: ReadonlyMap<string, string>;
    filterOpts: SleeveFilterOptions;
    /** The row-level plans behind any calculated name in `dimensions`. */
    calculatedDimensions?: SleeveCalculatedDimensions;
  }): SleeveResult {
    const { caller, computes, ownerCteName, dimensions, cteName, isIdentity } = spec;
    const { context, outputAliasToRoot, filterOpts } = spec;
    const ownerChain = context.chains.find(c => c.cteName === ownerCteName);
    if (!ownerChain) {
      throw new Error(
        `${caller}: no chain found for owner cteName='${ownerCteName}' ` +
          `of metric(s) [${computes}] ` +
          `(fieldIndex and context.chains are out of sync)`
      );
    }

    const qualify = createColumnQualifier(this.dialect, outputAliasToRoot);

    let rawJoins: string[];
    let dedupJoins: string[];
    if (isIdentity) {
      // Identity (raw ANY_VALUE passthrough) — UNCHANGED from R1: the metric OWNER's raw
      // ancestor closure is the sole fan-out identity source, feeding `__owox_rid` + the raw value.
      // The dedup-CTE joins cover dimensions + post-join filter columns only.
      rawJoins = this.buildSleeveAncestorJoins([ownerCteName], context);
      dedupJoins = this.buildSleeveDedupRootJoins(
        [...dimensions, ...sleeveJoinColumns(filterOpts)],
        outputAliasToRoot,
        context
      );
    } else {
      // Non-identity ( funnel shape) — the value lives in the OWNER's OWN dedup CTE
      // (`<ownerCteName>`), already collapsed to one row per pre-join GROUP KEY, so no raw
      // fan-out join for the owner is needed at all; only the raw ancestor closure of the
      // owner's PARENT (so the owner's dedup-CTE join below has something to attach to — empty
      // for a root owner, since `main` already exists). The owner's OWN dedup CTE join is
      // folded into the SAME combined set as the dimension/filter dedup joins so a chain that
      // is BOTH the value owner AND a dimension/filter root is only joined once.
      rawJoins = this.buildSleeveAncestorJoins([ownerChain.parentAlias], context);
      const dedupRootCteNames = new Set<string>([ownerCteName]);
      for (const col of [...dimensions, ...sleeveJoinColumns(filterOpts)]) {
        const root = outputAliasToRoot.get(col);
        if (root) dedupRootCteNames.add(root);
      }
      dedupJoins = context.chains
        .filter(c => dedupRootCteNames.has(c.cteName))
        .map(c => this.buildChainDedupJoinLine(c));
    }
    const joins = [
      ...rawJoins,
      ...dedupJoins,
      ...(filterOpts.keptGroups ? [`    ${filterOpts.keptGroups.join}`] : []),
    ];

    // Dimension expressions are built from the SAME `qualify(d)` the outer GROUP BY uses (the
    // dedup CTE's rolled-up value), so the sleeve's projected dimension, `dimRefs.outer`, and
    // the outer GROUP BY are byte-identical BY CONSTRUCTION — for a fanning blended dimension
    // the raw value the sleeve used to project ('A') never equalled the outer roll-up ('A, B').
    const dimRefs: { column: string; outer: string; sleeve: string }[] = [];
    const selectDims: string[] = [];
    dimensions.forEach((d, i) => {
      const outerExpr = this.renderDimensionExpr(d, context, {
        qualify,
        calculatedDimensions: spec.calculatedDimensions,
      });
      const dimAlias = this.dialect.quoteIdentifier(sleeveDimensionAlias(i));
      selectDims.push(`${outerExpr} AS ${dimAlias}`);
      dimRefs.push({
        column: d,
        outer: outerExpr,
        sleeve: `${this.dialect.quoteIdentifier(cteName)}.${dimAlias}`,
      });
    });

    // Owner identity leg of the inner `SELECT DISTINCT`: the joined mart's declared key, else a
    // per-raw-row surrogate, else — for a non-identity field — the owner dedup CTE's own group
    // key, which is already one row per key.
    let oidItems: string[];
    let oidAliasNames: string[];
    // The identity leg IS the dedup key: with no join conditions there is nothing to identify a
    // row by, and the DISTINCT would collapse equal values into one — a silent undercount.
    //
    // This is USER DATA, not an internal invariant: the create endpoint accepted an empty
    // `joinConditions` array (the update endpoint already required one), so such a relationship
    // can be sitting in the database. A bare Error would surface as a 500 whose body carries no
    // message at all — the user is told nothing and cannot act; a BusinessViolationException
    // names the relationship and the repair.
    if (ownerChain.relationship.joinConditions.length === 0) {
      throw new BusinessViolationException(
        `Joined source '${ownerCteName}' has no join conditions, so ` +
          `[${computes}] cannot be ` +
          `de-duplicated and would be undercounted. Edit the relationship to add a join condition`
      );
    }
    const rawOwnerAlias = this.dialect.quoteIdentifier(`${ownerCteName}_raw`);
    // Same resolver the raw-CTE builder used to decide what to project.
    const ownerIdentity = valueSleeveIdentityFor(ownerChain);
    if (isIdentity && ownerIdentity.kind === 'primary-key') {
      const pkRefs = ownerIdentity.columns.map(
        c => `${rawOwnerAlias}.${this.dialect.quoteFieldRef(c)}`
      );
      const surrogateRef = `${rawOwnerAlias}.${this.dialect.quoteIdentifier(ROW_SURROGATE_ALIAS)}`;
      // A declared key with a NULL component is not an identity: those rows must stay apart
      // instead of collapsing into one DISTINCT row and losing their values from the SUM. The key
      // rides as one slot PER COLUMN, so nothing has to be cast to text or concatenated.
      const identity = renderPrimaryKeyIdentitySlots(pkRefs, surrogateRef);
      // Rescues a key declared unique only WITHIN the join key (`line_no` per order), which is
      // indistinguishable from a correct declaration. A real key determines the join key anyway,
      // and `identityScopingJoinKeyColumns` then emits no slot at all.
      const partitionKeyRefs = identityScopingJoinKeyColumns(
        ownerIdentity.columns,
        ownerChain.relationship.joinConditions.map(jc => jc.targetFieldName)
      ).map(col => `${rawOwnerAlias}.${this.dialect.quoteFieldRef(col)}`);
      const pkAliasNames = identity.keyParts.map((_, i) => `_oid_k${i}`);
      const keyAliasNames = partitionKeyRefs.map((_, i) => `_oid_key_${i}`);
      oidAliasNames = ['_oid', ...pkAliasNames, ...keyAliasNames];
      oidItems = [
        `${identity.surrogate} AS ${this.dialect.quoteIdentifier('_oid')}`,
        ...identity.keyParts.map(
          (ref, i) => `${ref} AS ${this.dialect.quoteIdentifier(pkAliasNames[i])}`
        ),
        ...partitionKeyRefs.map(
          (ref, i) => `${ref} AS ${this.dialect.quoteIdentifier(keyAliasNames[i])}`
        ),
      ];
    } else if (isIdentity) {
      const ownerIdRef = `${rawOwnerAlias}.${this.dialect.quoteIdentifier(ROW_SURROGATE_ALIAS)}`;
      // The surrogate is numbered PER parent-join-key group (`buildRawCte` partitions the
      // window there), so it identifies a row only together with that key: without the key in
      // the tuple, row 1 of key A and row 1 of key B carrying the same value would collapse
      // into one DISTINCT row and the SUM would silently lose one of them.
      const partitionKeyRefs = ownerChain.relationship.joinConditions.map(
        jc => `${rawOwnerAlias}.${this.dialect.quoteFieldRef(jc.targetFieldName)}`
      );
      const keyAliasNames = partitionKeyRefs.map((_, i) => `_oid_key_${i}`);
      oidAliasNames = ['_oid', ...keyAliasNames];
      oidItems = [
        `${ownerIdRef} AS ${this.dialect.quoteIdentifier('_oid')}`,
        ...partitionKeyRefs.map(
          (ref, i) => `${ref} AS ${this.dialect.quoteIdentifier(keyAliasNames[i])}`
        ),
      ];
    } else {
      const keyRefs = ownerChain.relationship.joinConditions.map(
        jc =>
          `${this.dialect.quoteIdentifier(ownerCteName)}.${this.dialect.quoteFieldRef(jc.targetFieldName)}`
      );
      oidAliasNames = keyRefs.length === 1 ? ['_oid'] : keyRefs.map((_, i) => `_oid_${i}`);
      oidItems =
        keyRefs.length === 1
          ? [`${keyRefs[0]} AS ${this.dialect.quoteIdentifier('_oid')}`]
          : keyRefs.map((ref, i) => `${ref} AS ${this.dialect.quoteIdentifier(`_oid_${i}`)}`);
    }

    // Mediums: a report dimension literally named one of the synthetic aliases
    // this method assigns to the owner-identity leg (`_oid`, `_oid_<i>`, `_oid_k<i>`,
    // `_oid_key_<i>`), the value leg
    // (`_val`/`_val_<i>`), or the inner subquery's own table alias (`_dedup`) would silently
    // collide with that alias inside the `SELECT DISTINCT` (two SELECT items projected under
    // the SAME name) instead of failing loud — corrupting the dedup set rather than erroring.
    // This is USER DATA (a field/output alias can be named anything), not an invariant — same
    // class of guard `buildRawCte` applies to `__owox_rid`.
    const reservedInnerSleeveNames = new Set<string>([
      ...oidAliasNames,
      ...spec.slots.map(s => s.alias),
      '_dedup',
    ]);
    // A BACKSTOP: dimensions are positionally aliased now, so a dimension called `_oid` can no
    // longer collide with the identity leg. Kept because reverting to name-based aliases would
    // silently reopen it.
    //
    // Case-INSENSITIVE and unconditional rather than per dialect: these aliases are safe
    // identifiers, so they go unquoted, and Athena/Redshift fold them while Spark resolves
    // case-insensitively — `_OID` collides there exactly as `_oid` does. Snowflake always quotes,
    // so a dialect-dependent guard would accept the same saved report on one warehouse and
    // silently corrupt it on another.
    const foldedReservedInnerSleeveNames = new Set(
      Array.from(reservedInnerSleeveNames, n => n.toLowerCase())
    );
    const dimensionReservedNameCollisions = dimensions.filter(d =>
      foldedReservedInnerSleeveNames.has(d.toLowerCase())
    );
    if (dimensionReservedNameCollisions.length > 0) {
      throw new BusinessViolationException(
        `${caller}: dimension column(s) ` +
          `[${dimensionReservedNameCollisions.join(', ')}] collide with a reserved internal ` +
          `alias ('${Array.from(reservedInnerSleeveNames).join("', '")}') of the sleeve ` +
          `'${cteName}' computing [${computes}] ` +
          `— rename the field/output alias`,
        // Structured so callers that must not forward a raw message can still name the column.
        // The MCP tool builds its guidance from this alone; without it the message is dropped
        // and the agent gets an opaque failure it cannot act on.
        { reservedNameColumns: dimensionReservedNameCollisions }
      );
    }

    const innerValueItems = spec.slots.map(
      s => `${s.sql} AS ${this.dialect.quoteIdentifier(s.alias)}`
    );
    const innerSelectItems = [...selectDims, ...oidItems, ...innerValueItems];

    // The outer wrapper groups by the DIMENSION'S OWN ALIAS as already projected by the inner
    // subquery — only the subquery's SELECT list is in scope out here.
    const outerDimCols = dimensions.map((_, i) =>
      this.dialect.quoteIdentifier(sleeveDimensionAlias(i))
    );

    // No report dimensions (a lone grand-total group): the outer wrapper collapses to one
    // global row, so it must NOT emit a trailing `GROUP BY` with no keys.
    const outerGroupByLine =
      outerDimCols.length > 0 ? `    GROUP BY ${outerDimCols.join(', ')}\n` : '';
    const indentedJoins = joins.map(j => `  ${j}`).join('\n');

    // the post-join WHERE runs inside the INNER dedup subquery (6-space indent), so
    // the DISTINCT set — and therefore every outer aggregate — is over the FILTERED rows only.
    const where = this.renderSleeveWhere(filterOpts, qualify);
    const indentedWhere = where.sql ? where.sql.replace(/\n/g, '\n      ') : '';

    // A SQL comment ABOVE the CTE saying what this calculation is and why it exists, so a human
    // reading the GENERATED SQL (not this source file) understands the extra CTE without
    // archaeology. Two lines: the claim, then the reason it has to be computed this way.
    const sleeveLabel = sanitizeSqlComment(
      `calculation: ${computes} de-duplicated before aggregating,`
    );
    const sleeveReason = sanitizeSqlComment(`so the join's fan-out cannot distort it`);

    const sql =
      `  -- ${sleeveLabel}\n  -- ${sleeveReason}\n` +
      `  ${this.dialect.quoteIdentifier(cteName)} AS (\n` +
      `    SELECT\n      ${[...outerDimCols, ...spec.outer.items].join(',\n      ')}\n` +
      `    FROM (\n` +
      `      SELECT DISTINCT\n        ${innerSelectItems.join(',\n        ')}\n` +
      `      FROM ${this.dialect.quoteIdentifier('main')}\n` +
      `${indentedJoins}` +
      `${indentedWhere}\n` +
      `    ) ${this.dialect.quoteIdentifier('_dedup')}\n` +
      outerGroupByLine +
      `  )`;

    return { cteName, pulls: spec.outer.pulls, dimRefs, sql, params: where.params };
  }

  /**
   * A "metric sleeve" CTE for one joined metric: re-joins `main` with the RAW pre-dedup CTEs and
   * re-aggregates at the REPORT dimension grain. That is what makes a joined COUNT_DISTINCT/SUM/AVG
   * correct — the dedup CTE already collapsed to one row per parent-join-key, so aggregating there
   * double- or under-counts against the report's GROUP BY.
   *
   * SUM/AVG wrap a `SELECT DISTINCT (dims, owner `__owox_rid`, value)`: `__owox_rid` is the owning
   * chain's per-raw-row surrogate, so a value that fans out to several report rows is counted at
   * most once per PRE-fanout owner row. COUNT_DISTINCT needs no such nesting.
   *
   * Reusing the raw CTEs is a SQL-TEXT guarantee only; a CTE-inlining engine may still re-scan the
   * source table per reference.
   *
   * An empty `dimensions` list collapses the sleeve to a single global row: no GROUP BY, empty
   * `dimRefs`, and the caller must CROSS JOIN it instead of a dimension-tuple ON.
   */
  buildSleeveCte(
    metric: AggregationRule,
    dimensions: string[],
    context: BlendedQueryContext,
    outputAliasToRoot: ReadonlyMap<string, string>,
    // 1 review (FIX 1): the caller-resolved final CTE name after the cross-sleeve
    // collision guard (`disambiguateSleeveCteNames`) has run. Omitted → the bare per-column
    // `sleeve_<col>` default (its own unit tests pin that). Set ONLY when a name would
    // otherwise duplicate another sleeve's in the same WITH.
    cteNameOverride?: string,
    // the report's post-join WHERE this sleeve must reproduce internally, plus a
    // unique param prefix. Defaults to none (direct unit-test calls that only exercise the
    // dimension/metric shape); `buildBlendedQuery` always passes the real filters.
    filterOpts: SleeveFilterOptions = NO_SLEEVE_FILTERS,
    // the full set of COUNT DISTINCT metrics this one CTE serves, when the
    // caller merged several that share an owner chain and dimensions. Omitted → just `metric`.
    mergedMetrics?: AggregationRule[],
    // The row-level plans behind any calculated name in `dimensions`.
    calculatedDimensions?: SleeveCalculatedDimensions
  ): {
    cteName: string;
    alias: string;
    dimRefs: { column: string; outer: string; sleeve: string }[];
    sql: string;
    params: SqlParameter[];
    pulls: SleevePull[];
  } {
    // Invariant: a sleeve metric is only ever collected for a blended (joined) column, whose
    // resolution requires the field index the real caller (BlendedReportDataService) always
    // builds and passes. Reaching here without one means a caller wired the aggregated blended
    // path without a fieldIndex — fail loud rather than dereference `undefined`.
    const fieldIndex = context.fieldIndex;
    if (!fieldIndex) {
      throw new Error(
        `buildSleeveCte: context.fieldIndex is required to resolve sleeve metric column='${metric.column}' ` +
          `(a joined COUNT_DISTINCT sleeve needs a populated blended field index)`
      );
    }
    const metricEntry = fieldIndex.get(metric.column);
    if (!metricEntry) {
      // Symmetric to the fieldIndex-absent guard above: a present-but-empty ENTRY is a
      // distinct failure mode (e.g. a hidden aggregated column — buildBlendedFieldIndex
      // skips hidden fields, but mapOutputAliasesToRoot still adds them to
      // outputAliasToRoot). Fail loud here too instead of dereferencing `undefined`.
      throw new BusinessViolationException(
        `buildSleeveCte: no fieldIndex entry for sleeve metric column='${metric.column}' ` +
          `(the column is aggregated but missing from the blended field index)`
      );
    }
    // Name the sleeve CTE per METRIC, not per source chain: two COUNT_DISTINCT metrics can
    // legitimately target two different blended columns of the same chain (save-time
    // validation only rejects duplicate (column, function) pairs), and each sleeve-eligible
    // metric/group emits its own CTE — a chain-keyed name would collide into two identically-
    // named CTEs in one WITH. Default to the bare per-column name; the caller may override it
    // with a collision-disambiguated name (see `cteNameOverride`).
    const sleeveCteName = cteNameOverride ?? sleeveCteNameForColumn(metric.column);

    if (VALUE_SLEEVE_FUNCTIONS.has(metric.function)) {
      const ownerCteName = this.sleeveRawRef(metric.column, fieldIndex, outputAliasToRoot).cteName;
      if (!ownerCteName) {
        throw new Error(
          `buildSleeveCte: value-sleeve metric column='${metric.column}' resolved to a main ` +
            `(non-blended) column; a ${metric.function} value sleeve requires a joined column`
        );
      }
      const merged = this.buildValueSleeveGroupCte(
        { ownerCteName, dimensions, metrics: [metric] },
        context,
        outputAliasToRoot,
        sleeveCteName,
        filterOpts,
        calculatedDimensions
      );
      return {
        cteName: merged.cteName,
        alias: merged.pulls[0].alias,
        dimRefs: merged.dimRefs,
        sql: merged.sql,
        params: merged.params,
        pulls: merged.pulls,
      };
    }

    // ---- COUNT_DISTINCT (the only other sleeve-eligible function today) — single-level form:
    // count distinct directly at the report-dimension grain. 1 does NOT merge this
    // branch: a COUNT_DISTINCT sleeve's dedup shape differs from a value sleeve's nested form.

    // Everything else about this CTE — its joins, its WHERE, its GROUP BY — is derived from
    // `metric` alone, so a merged metric owned by another chain would be counted over the wrong
    // join closure, and a non-COUNT_DISTINCT one would silently come out as a COUNT DISTINCT.
    // `buildAll` groups exactly that way, but this method is public: same reason
    // `buildValueSleeveGroupCte` guards the single-shape invariant its own planner guarantees.
    const foreignMerged = (mergedMetrics ?? []).filter(
      m =>
        m.function !== 'COUNT_DISTINCT' ||
        this.sleeveRawRef(m.column, fieldIndex, outputAliasToRoot).cteName !== metricEntry.cteName
    );
    if (foreignMerged.length > 0) {
      throw new Error(
        `buildSleeveCte: metric(s) ` +
          `[${foreignMerged.map(m => `${m.function}(${m.column})`).join(', ')}] were merged into ` +
          `the COUNT DISTINCT sleeve of ${metric.function}(${metric.column}) but are not ` +
          `COUNT_DISTINCT on owner cteName='${metricEntry.cteName}' — the caller must group ` +
          `sleeve metrics by function and owner chain before calling this method`
      );
    }

    // several COUNT DISTINCT metrics on the SAME owner chain and the same
    // dimensions resolve to the SAME joins, the same WHERE and the same GROUP BY — only the
    // counted column differs. They are emitted as one CTE with one aggregate per metric, so a
    // Totals report over five joined text columns scans once instead of five times (nothing
    // materialises a CTE per reference). `mergedMetrics` is [metric] for the singleton case,
    // which keeps that SQL byte-identical.
    const countedMetrics = mergedMetrics ?? [metric];
    const alias = aggregatedColumnLabel(metric.column, metric.function);
    // DELIBERATE divergence from the value sleeve ( M4 / round-2 F2): this always
    // counts distinct RAW values, and does NOT branch on `isIdentityPreJoinField` the way
    // `buildValueSleeveGroupCte` does. For a field with a non-identity pre-join roll-up the
    // value sleeve MUST read the rolled-up value (summing raw ids is meaningless), whereas
    // "how many distinct values are there" is the more correct answer at the raw grain —
    // counting distinct roll-ups conflates different raw values that happen to roll up to the
    // same combined string. Documented in the changeset as a behaviour change for saved reports.
    const countItems = countedMetrics.map(m => {
      const ref = this.sleeveRawRef(m.column, fieldIndex, outputAliasToRoot).ref;
      const itemAlias = aggregatedColumnLabel(m.column, m.function);
      return {
        metric: m,
        alias: itemAlias,
        sql: `${this.dialect.buildAggregation('COUNT_DISTINCT', ref)} AS ${this.dialect.quoteIdentifier(itemAlias)}`,
      };
    });

    const built = this.buildCountingSleeveCte({
      ownerCteName: metricEntry.cteName,
      ownerDescription: `metric ${metric.function}(${metric.column})`,
      cteName: sleeveCteName,
      dimensions,
      countItems: countItems.map(i => i.sql),
      calculationLabel: `calculation: unique ${countedMetrics
        .map(m => m.column)
        .join(', ')} counted over the raw rows,`,
      context,
      outputAliasToRoot,
      filterOpts,
      calculatedDimensions,
    });

    return {
      cteName: sleeveCteName,
      alias,
      dimRefs: built.dimRefs,
      sql: built.sql,
      params: built.params,
      pulls: countItems.map(i => ({
        metric: i.metric,
        alias: i.alias,
        coalesceEmptyToZero: true,
      })),
    };
  }

  /**
   * A joined source's own `Unique Count` — how many distinct rows of that source, by its DECLARED
   * PRIMARY KEY, the report's dimension grain contains. Same sleeve as a joined COUNT_DISTINCT (it
   * shares every join / dimension / WHERE decision through `buildCountingSleeveCte`); what differs
   * is that it counts a declared key rather than a selected column, so a source with no selected
   * column of its own is still counted — and that the key rides as one SLOT PER COLUMN inside the
   * sleeve's own `SELECT DISTINCT`, counted by an outer `COUNT`.
   *
   * The slots are what make this correct. Reducing the key to ONE scalar for `COUNT(DISTINCT …)`
   * meant casting every component to text, and a text cast is lossy: under Snowflake's default
   * `TIMESTAMP_OUTPUT_FORMAT` a nanosecond timestamp renders to milliseconds, so a
   * `(user_id, started_at)` key merged two rows 100 µs apart. A sleeve controls its own shape, so
   * it does not have to pay that price; the FLAT main-Data-Mart count in `sql-clause-renderer`
   * has no CTE to dedup in and keeps the scalar form.
   */
  buildUniqueCountSleeveCte(
    source: JoinedUniqueCountSleeve,
    dimensions: string[],
    context: BlendedQueryContext,
    outputAliasToRoot: ReadonlyMap<string, string>,
    cteName: string,
    filterOpts: SleeveFilterOptions = NO_SLEEVE_FILTERS,
    calculatedDimensions?: SleeveCalculatedDimensions
  ): SleeveResult {
    // USER DATA, like the join-conditions guard above: the key is read from the joined Data Mart's
    // schema, which can lose it after the report was saved. A bare Error is a 500 with an empty
    // body — the user is told nothing and cannot act.
    if (source.pkColumns.length === 0) {
      throw new BusinessViolationException(
        `Joined Data Mart '${source.aliasPath}' has no primary key columns, so its Unique Count ` +
          `cannot be counted. Declare a top-level, connected primary key on that Data Mart, or ` +
          `remove its Unique Count from the report`
      );
    }
    const ownerDescription = `Unique Count source '${source.aliasPath}'`;
    const ownerChain = this.resolveSleeveOwnerChain(source.cteName, ownerDescription, context);
    const rawAlias = this.dialect.quoteIdentifier(`${source.cteName}_raw`);
    const slotItem = (column: string, alias: string): string =>
      `${rawAlias}.${this.dialect.quoteFieldRef(column)} AS ${this.dialect.quoteIdentifier(alias)}`;
    const pkSlotAliases = source.pkColumns.map((_, i) => `_uc_pk_${i}`);
    // Rescues a key declared unique only WITHIN the join key (`line_no` per order), which is
    // indistinguishable from a correct declaration — the same rescue the value sleeve's identity
    // makes, so both readers of one declared key mean the same thing by it. A real key determines
    // the join key anyway, and `identityScopingJoinKeyColumns` then emits no slot at all. The join
    // key SCOPES the identity; it is not part of it, so the count's NULL guard below stays on the
    // declared key alone.
    const identityItems = [
      ...source.pkColumns.map((col, i) => slotItem(col, pkSlotAliases[i])),
      ...identityScopingJoinKeyColumns(
        source.pkColumns,
        ownerChain.relationship.joinConditions.map(jc => jc.targetFieldName)
      ).map((col, i) => slotItem(col, `_uc_jk_${i}`)),
    ];
    const countRef = renderPrimaryKeyCountedSlotRef(
      pkSlotAliases.map(a => this.dialect.quoteIdentifier(a))
    );
    const countItem = `${this.dialect.buildAggregation('COUNT', countRef)} AS ${this.dialect.quoteIdentifier(source.outputLabel)}`;

    const built = this.buildCountingSleeveCte({
      ownerCteName: source.cteName,
      ownerDescription,
      cteName,
      dimensions,
      countItems: [countItem],
      distinctIdentityItems: identityItems,
      calculationLabel: `calculation: unique ${source.aliasPath} rows counted by primary key over the raw rows,`,
      context,
      outputAliasToRoot,
      filterOpts,
      calculatedDimensions,
    });

    return {
      cteName,
      dimRefs: built.dimRefs,
      sql: built.sql,
      params: built.params,
      pulls: [{ alias: source.outputLabel, coalesceEmptyToZero: true }],
    };
  }

  /**
   * The chain a counting sleeve is built over. Symmetric to the value sleeve's guard: an owner
   * cteName with no chain would emit joins referencing a CTE that is never declared — a raw engine
   * "table not found" instead of a sentence naming what was being counted.
   */
  private resolveSleeveOwnerChain(
    ownerCteName: string,
    ownerDescription: string,
    context: BlendedQueryContext
  ): ResolvedRelationshipChain {
    const chain = context.chains.find(c => c.cteName === ownerCteName);
    if (!chain) {
      // The chain set is derived from relationships the user can delete or exclude between saving
      // a report and running it, so this is reachable from user data — not a 500 with no message.
      throw new BusinessViolationException(
        `Joined source '${ownerCteName}' of ${ownerDescription} is not among this report's ` +
          `resolved joins, so it has no rows to read. Check that the Data Mart is still ` +
          `joined to this one and allowed for reporting`
      );
    }
    return chain;
  }

  /**
   * The join / dimension / WHERE / GROUP BY assembly every COUNTING sleeve shares. A joined
   * COUNT_DISTINCT of a selected column and a joined source's Unique Count of a declared key differ
   * ONLY in what they count, so they must not own two copies of this — the caller supplies finished
   * SELECT items and this decides everything else about the CTE.
   *
   * Two nestings, chosen by `distinctIdentityItems`:
   * - FLAT — `COUNT(DISTINCT <column>)` straight over the joined raw rows. What "how many distinct
   *   VALUES" means; a value is one scalar already, so there is nothing to dedup first.
   * - NESTED — an inner `SELECT DISTINCT <dims>, <identity slots>` wrapped by the caller's
   *   aggregates over those slot aliases. What counting distinct ROWS needs: a row identity spans
   *   several columns, and a tuple can hold them side by side instead of squeezing them into one
   *   text scalar.
   */
  private buildCountingSleeveCte(opts: {
    /** The chain whose RAW ancestor closure is the fan-out identity source counted over. */
    ownerCteName: string;
    /** What the owner is FOR, quoted back in the "chain is missing" error. */
    ownerDescription: string;
    cteName: string;
    dimensions: string[];
    /** Finished `<aggregate> AS <alias>` SELECT items, in emission order. */
    countItems: string[];
    /**
     * Finished `<ref> AS <alias>` items for the inner `SELECT DISTINCT`. Set → the NESTED form, and
     * `countItems` must aggregate those aliases; omitted → the flat form.
     */
    distinctIdentityItems?: string[];
    /** The first comment line above the CTE: what this calculation is. */
    calculationLabel: string;
    context: BlendedQueryContext;
    outputAliasToRoot: ReadonlyMap<string, string>;
    filterOpts: SleeveFilterOptions;
    /** The row-level plans behind any calculated name in `dimensions`. */
    calculatedDimensions?: SleeveCalculatedDimensions;
  }): {
    dimRefs: { column: string; outer: string; sleeve: string }[];
    sql: string;
    params: SqlParameter[];
  } {
    const { context, outputAliasToRoot, filterOpts, cteName, dimensions } = opts;
    const qualify = createColumnQualifier(this.dialect, outputAliasToRoot);

    // Two join sets (/C2), same construction as the value sleeve: (1) the owner's raw
    // ancestor closure — the fan-out identity source the count reads; (2) the DEDUP
    // CTEs of every blended dimension AND post-join filter column, so both resolve through the
    // SAME `qualify` ref the outer query uses (the dedup CTEs are 1:1 with `main`, no fan-out).
    this.resolveSleeveOwnerChain(opts.ownerCteName, opts.ownerDescription, context);
    const rawJoins = this.buildSleeveAncestorJoins([opts.ownerCteName], context);
    const dedupJoins = this.buildSleeveDedupRootJoins(
      [...dimensions, ...sleeveJoinColumns(filterOpts)],
      outputAliasToRoot,
      context
    );
    const joins = [
      ...rawJoins,
      ...dedupJoins,
      ...(filterOpts.keptGroups ? [`    ${filterOpts.keptGroups.join}`] : []),
    ];

    // Dimension expressions are built from the SAME `qualify(d)` the outer GROUP BY uses, so the
    // sleeve's projected dimension, `dimRefs.outer`, and the outer GROUP BY are byte-identical
    // BY CONSTRUCTION ( — a fanning blended dimension's roll-up otherwise disagrees with
    // the raw value the sleeve used to project, and the NULL-safe join-back never matched).
    const dimRefs: { column: string; outer: string; sleeve: string }[] = [];
    const groupByParts: string[] = [];
    const selectDims: string[] = [];
    dimensions.forEach((d, i) => {
      const outerExpr = this.renderDimensionExpr(d, context, {
        qualify,
        calculatedDimensions: opts.calculatedDimensions,
      });
      const dimAlias = this.dialect.quoteIdentifier(sleeveDimensionAlias(i));
      groupByParts.push(outerExpr);
      selectDims.push(`${outerExpr} AS ${dimAlias}`);
      dimRefs.push({
        column: d,
        outer: outerExpr,
        // The sleeve CTE's OWN projected column, not the raw ref — the join this
        // feeds runs OUTSIDE the CTE, where only its SELECTed columns are visible.
        sleeve: `${this.dialect.quoteIdentifier(cteName)}.${dimAlias}`,
      });
    });

    // reproduce the report's post-join WHERE inside the sleeve so the count runs over
    // the FILTERED set (before GROUP BY, and in the NESTED form inside the DISTINCT subquery so
    // the deduped set is over the filtered rows too).
    const where = this.renderSleeveWhere(filterOpts, qualify);

    // See buildValueSleeveGroupCte: the same two-line shape, for the counting form.
    const sleeveLabel = sanitizeSqlComment(opts.calculationLabel);
    const sleeveReason = sanitizeSqlComment(
      `so the join's roll-up cannot hide values and its fan-out cannot inflate them`
    );
    const header =
      `  -- ${sleeveLabel}\n  -- ${sleeveReason}\n` +
      `  ${this.dialect.quoteIdentifier(cteName)} AS (\n`;

    // No report dimensions (a lone grand-total count, e.g. Totals with no grouping): the sleeve
    // collapses to one global row, so it must NOT emit a trailing `GROUP BY` with no keys —
    // that's invalid SQL, not "group by nothing".
    if (opts.distinctIdentityItems) {
      // The outer wrapper groups by the dimension's OWN ALIAS as the inner subquery projected it —
      // only that SELECT list is in scope out here.
      const outerDimCols = dimensions.map((_, i) =>
        this.dialect.quoteIdentifier(sleeveDimensionAlias(i))
      );
      const sql =
        header +
        `    SELECT\n      ${[...outerDimCols, ...opts.countItems].join(',\n      ')}\n` +
        `    FROM (\n` +
        `      SELECT DISTINCT\n        ` +
        `${[...selectDims, ...opts.distinctIdentityItems].join(',\n        ')}\n` +
        `      FROM ${this.dialect.quoteIdentifier('main')}\n` +
        `${joins.map(j => `  ${j}`).join('\n')}` +
        `${where.sql ? where.sql.replace(/\n/g, '\n      ') : ''}\n` +
        `    ) ${this.dialect.quoteIdentifier('_dedup')}\n` +
        (outerDimCols.length > 0 ? `    GROUP BY ${outerDimCols.join(', ')}\n` : '') +
        `  )`;
      return { dimRefs, sql, params: where.params };
    }

    const sql =
      header +
      `    SELECT\n      ${[...selectDims, ...opts.countItems].join(',\n      ')}\n` +
      `    FROM ${this.dialect.quoteIdentifier('main')}\n` +
      `${joins.join('\n')}` +
      `${where.sql ? where.sql.replace(/\n/g, '\n    ') : ''}\n` +
      (groupByParts.length > 0 ? `    GROUP BY ${groupByParts.join(', ')}\n` : '') +
      `  )`;

    return { dimRefs, sql, params: where.params };
  }

  /**
   * Renders ONE element of a sleeve's grain through the SAME functions `renderAggregatedSelect`
   * uses, so the sleeve's SELECT/GROUP BY stays byte-identical to the outer aggregated SELECT for
   * that key. Takes the grain ELEMENT rather than a qualified ref: a calculated field is a NAME in
   * the grain and an expression on `opts.calculatedDimensions`, with no column to qualify.
   *
   * The calculated branch is checked FIRST — `qualify(dimension)` would resolve a calculated name
   * against `main` and emit a column no CTE projects — but must NOT return before the date bucket
   * is applied. A row-level calculated field may be bucketed, and the outer SELECT then groups by
   * `renderDateTruncExpression(renderRowLevelDimensionExpression(...), ...)`. Both steps, in that
   * order, or the sleeve joins on the raw formula against a truncated outer key and the metric
   * reads NULL on every row.
   *
   * The type argument is the PLAN's declared type, not `columnTypes.postJoin`: the plan objects are
   * the same ones the outer SELECT renders from, so identity holds by object rather than by two
   * lookups agreeing.
   */
  renderDimensionExpr(
    dimension: string,
    context: BlendedQueryContext,
    opts: {
      /** How a real column becomes a ref — the SAME qualifier the outer query resolves through. */
      qualify: ColumnRefResolver;
      calculatedDimensions?: SleeveCalculatedDimensions;
    }
  ): string {
    const plan = opts.calculatedDimensions?.plans.get(dimension);
    if (plan) {
      const renderer = this.dialect.clauseRenderer();
      if (!renderer) {
        throw new Error(
          `renderDimensionExpr: dimension '${dimension}' is a row-level calculated field but ` +
            `this storage has no clause renderer, so its formula cannot be rendered inside the sleeve`
        );
      }
      const expression = renderer.renderRowLevelDimensionExpression(
        plan,
        opts.calculatedDimensions!.renderOptions
      );
      const { units, zones } = this.dateTruncMapsFor(context);
      const unit = units?.get(dimension);
      return unit
        ? renderer.renderDateTruncExpression(expression, unit, zones?.get(dimension), plan.type)
        : expression;
    }
    const ref = opts.qualify(dimension);
    const { units, zones } = this.dateTruncMapsFor(context);
    const unit = units?.get(dimension);
    if (!unit) return ref;
    const renderer = this.dialect.clauseRenderer();
    if (!renderer) {
      // Returning `ref` here would drop the truncation silently, so the sleeve would group by
      // the raw column while the outer query groups by the truncated one — the join-back then
      // matches nothing. Unreachable from `buildBlendedQuery` (its capability guard rejects a
      // rendererless dialect long before), but this method is public.
      throw new Error(
        `renderDimensionExpr: dimension '${dimension}' carries a date-trunc unit but this storage ` +
          `has no clause renderer, so the truncation cannot be reproduced inside the sleeve`
      );
    }
    const type = context.columnTypes?.postJoin?.get(dimension);
    return renderer.renderDateTruncExpression(ref, unit, zones?.get(dimension), type);
  }

  /**
   * Both date-trunc maps for one query, memoised on the `dateTruncs` array itself — this runs
   * once per dimension per sleeve, and rebuilding two maps each time is pure waste.
   */
  private dateTruncMapsFor(context: BlendedQueryContext): {
    units?: ReadonlyMap<string, DateTruncUnit>;
    zones?: ReadonlyMap<string, string>;
  } {
    const rules = context.dateTruncs;
    if (!rules?.length) return {};
    const cached = this.dateTruncMaps.get(rules);
    if (cached) return cached;
    const maps = {
      units: buildOptionalDateTruncUnitMap(rules),
      zones: buildTimeZoneMap(rules),
    };
    this.dateTruncMaps.set(rules, maps);
    return maps;
  }
}
