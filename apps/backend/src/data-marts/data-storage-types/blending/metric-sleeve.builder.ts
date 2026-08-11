import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import {
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
import { ColumnRefResolver, ColumnTypeResolver, SqlParameter } from '../utils/sql-clause-renderer';
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
  NO_SLEEVE_FILTERS,
  ROW_SURROGATE_ALIAS,
  SleeveFilterOptions,
  SleevePull,
  SleeveResult,
  ValueSleeveGroup,
} from './blended-query.types';
import {
  collectReportDimensions,
  disambiguateSleeveCteNames,
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
    }
  ): SleeveResult[] {
    const { outputAliasToRoot, filters, resolveColumnType, keptGroups } = opts;
    // --- Sleeve metrics: a joined COUNT_DISTINCT is computed in a separate CTE that
    // re-joins the raw (pre-dedup) path and counts distinct at the report dimension
    // grain — NOT via the normal dedup-then-SUM re-aggregation, which over-counts.
    const dimensions = collectReportDimensions(context.columns, context.aggregations ?? []);
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
            group.metrics
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
              filterOpts
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
            filterOpts
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
            filterOpts
          ),
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
   * the `LEFT JOIN <root> ON main.<src> = <root>.<tgt>` clauses (the DEDUP CTEs, at
   * the coarse post-dedup grain) a sleeve subquery needs so a BLENDED dimension or post-join
   * filter column resolves through the SAME `qualifyColumn` ref the OUTER query uses — making
   * the sleeve's projected dimension, `dimRefs.outer`, and the outer GROUP BY byte-identical by
   * CONSTRUCTION (a fanning blended dimension's roll-up, e.g. STRING_AGG → 'A, B', otherwise
   * disagrees with the raw value 'A' the sleeve used to project, so the join-back never matched).
   *
   * One join per DISTINCT root chain; a main-native column needs none (it references `main`
   * directly). These dedup CTEs are 1:1 with `main` (they GROUP BY their parent-join-key), so
   * joining them does NOT add fan-out — the raw CTEs joined by `buildSleeveAncestorJoins` remain
   * the sole fan-out identity source. Emitted in `context.chains` order (parents before children)
   * for deterministic SQL; 4-space indent, matching `buildSleeveAncestorJoins`.
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
  // when there is nothing to apply. `renderWhere` already skips HAVING (function) rules.
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
      filterOpts.resolveColumnType
    );
  }

  /**
   * builds ONE merged value-sleeve CTE for a GROUP of SUM/AVG metrics sharing the
   * same owner chain + dimensions — a SINGLE inner `SELECT DISTINCT (dims, owner identity,
   * value_i...)` dedup pass, wrapped by an outer SELECT computing every metric's own aggregate
   * over its own value slot. Metrics that target the SAME underlying column (SUM + AVG of one
   * field) share ONE value slot (`_val`) — the dedup set is identical for both, so deduping it
   * twice would be wasted work, which is the concrete case this merge exists for. Metrics on
   * DIFFERENT columns would get their own slot (`_val_0`, `_val_1`, ...) inside the same pass,
   * but the planner no longer forms such a group: `DISTINCT` spans the whole tuple, so a second
   * column's variation would keep rows apart that the first column's identity means to collapse.
   * Structurally mirrors `buildSleeveCte`'s SUM/AVG branch (which delegates here for the common
   * singleton-metric case) generalized to N metrics.
   *
   * (C3): the "owner identity" and "value" legs branch on whether the owner's OWN
   * pre-join `aggregateFunction` is a raw passthrough or a real aggregate
   * (`isIdentityPreJoinField`) — see the two branches below. `splitValueSleeveGroupsByIdentity`
   * guarantees every metric in `group.metrics` shares ONE classification before this method
   * ever sees it; the check here is a defensive invariant, not a routing decision.
   */
  buildValueSleeveGroupCte(
    group: ValueSleeveGroup,
    context: BlendedQueryContext,
    outputAliasToRoot: ReadonlyMap<string, string>,
    cteName: string,
    filterOpts: SleeveFilterOptions = NO_SLEEVE_FILTERS
  ): SleeveResult {
    const fieldIndex = context.fieldIndex;
    if (!fieldIndex) {
      throw new Error(
        `buildValueSleeveGroupCte: context.fieldIndex is required to resolve value-sleeve ` +
          `metric(s) [${group.metrics.map(m => `${m.function}(${m.column})`).join(', ')}] ` +
          `for owner cteName='${group.ownerCteName}'`
      );
    }
    const ownerChain = context.chains.find(c => c.cteName === group.ownerCteName);
    if (!ownerChain) {
      throw new Error(
        `buildValueSleeveGroupCte: no chain found for owner cteName='${group.ownerCteName}' ` +
          `of metric(s) [${group.metrics.map(m => `${m.function}(${m.column})`).join(', ')}] ` +
          `(fieldIndex and context.chains are out of sync)`
      );
    }
    const identityFlags = new Set(
      group.metrics.map(m => isIdentityPreJoinField(m.column, fieldIndex, context))
    );
    if (identityFlags.size > 1) {
      throw new Error(
        `buildValueSleeveGroupCte: owner cteName='${group.ownerCteName}' mixes an identity ` +
          `(ANY_VALUE) pre-join field with a non-identity one in the SAME group ` +
          `[${group.metrics.map(m => `${m.function}(${m.column})`).join(', ')}] — ` +
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

    const dimensions = group.dimensions;
    const qualify = createColumnQualifier(this.dialect, outputAliasToRoot);

    let rawJoins: string[];
    let dedupJoins: string[];
    if (isIdentity) {
      // Identity (raw ANY_VALUE passthrough) — UNCHANGED from R1: the metric OWNER's raw
      // ancestor closure is the sole fan-out identity source, feeding `__owox_rid` + the raw value.
      // The dedup-CTE joins cover dimensions + post-join filter columns only.
      rawJoins = this.buildSleeveAncestorJoins([group.ownerCteName], context);
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
      const dedupRootCteNames = new Set<string>([group.ownerCteName]);
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
      const outerExpr = this.renderDimensionExpr(qualify(d), d, context);
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
        `Joined source '${group.ownerCteName}' has no join conditions, so ` +
          `[${group.metrics.map(m => `${m.function}(${m.column})`).join(', ')}] cannot be ` +
          `de-duplicated and would be undercounted. Edit the relationship to add a join condition`
      );
    }
    const rawOwnerAlias = this.dialect.quoteIdentifier(`${group.ownerCteName}_raw`);
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
          `${this.dialect.quoteIdentifier(group.ownerCteName)}.${this.dialect.quoteFieldRef(jc.targetFieldName)}`
      );
      oidAliasNames = keyRefs.length === 1 ? ['_oid'] : keyRefs.map((_, i) => `_oid_${i}`);
      oidItems =
        keyRefs.length === 1
          ? [`${keyRefs[0]} AS ${this.dialect.quoteIdentifier('_oid')}`]
          : keyRefs.map((ref, i) => `${ref} AS ${this.dialect.quoteIdentifier(`_oid_${i}`)}`);
    }

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
      ...valueSlotByColumn.values(),
      '_dedup',
    ]);
    // A BACKSTOP since dimensions became positionally aliased (`_owox_dim_<i>`): they no longer
    // enter this SELECT under their own names, so a dimension called `_oid` can no longer collide
    // with the identity leg. It stays because the invariant is structural rather than obvious —
    // reverting to name-based dimension aliases would silently reopen the collision, and this
    // file's style is to assert such invariants instead of trusting them.
    //
    // Matched case-INSENSITIVELY, and unconditionally rather than per dialect: these aliases are
    // safe identifiers, so `quoteIdentifier` leaves them unquoted, and Athena/Redshift then fold
    // them to lower case while Spark resolves identifiers case-insensitively — a dimension named
    // `_OID` collides there exactly as `_oid` does. Snowflake always quotes, so the name would in
    // fact be safe there; a dialect-dependent guard would mean the SAME saved report is accepted
    // on one warehouse and silently corrupted on another, which is worse than rejecting a name
    // that would technically have worked on one of them.
    const foldedReservedInnerSleeveNames = new Set(
      Array.from(reservedInnerSleeveNames, n => n.toLowerCase())
    );
    const dimensionReservedNameCollisions = dimensions.filter(d =>
      foldedReservedInnerSleeveNames.has(d.toLowerCase())
    );
    if (dimensionReservedNameCollisions.length > 0) {
      throw new BusinessViolationException(
        `buildValueSleeveGroupCte: dimension column(s) ` +
          `[${dimensionReservedNameCollisions.join(', ')}] collide with a reserved internal ` +
          `alias ('${Array.from(reservedInnerSleeveNames).join("', '")}') of the sleeve ` +
          `'${cteName}' computing [${group.metrics.map(m => `${m.function}(${m.column})`).join(', ')}] ` +
          `— rename the field/output alias`,
        // Structured so callers that must not forward a raw message can still name the column.
        // The MCP tool builds its guidance from this alone; without it the message is dropped
        // and the agent gets an opaque failure it cannot act on.
        { reservedNameColumns: dimensionReservedNameCollisions }
      );
    }

    const innerValueItems = distinctColumns.map(col => {
      const ref = isIdentity
        ? this.sleeveRawRef(col, fieldIndex, outputAliasToRoot).ref
        : `${this.dialect.quoteIdentifier(group.ownerCteName)}.${this.dialect.quoteIdentifier(col)}`;
      return `${ref} AS ${this.dialect.quoteIdentifier(valueSlotByColumn.get(col)!)}`;
    });
    const innerSelectItems = [...selectDims, ...oidItems, ...innerValueItems];

    // The outer wrapper groups by the DIMENSION'S OWN ALIAS as already projected by the inner
    // subquery — only the subquery's SELECT list is in scope out here.
    const outerDimCols = dimensions.map((_, i) =>
      this.dialect.quoteIdentifier(sleeveDimensionAlias(i))
    );
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
    const metricsLabel = group.metrics.map(m => `${m.function}(${m.column})`).join(', ');
    const sleeveLabel = sanitizeSqlComment(
      `calculation: ${metricsLabel} de-duplicated before aggregating,`
    );
    const sleeveReason = sanitizeSqlComment(`so the join's fan-out cannot distort it`);

    const sql =
      `  -- ${sleeveLabel}\n  -- ${sleeveReason}\n` +
      `  ${this.dialect.quoteIdentifier(cteName)} AS (\n` +
      `    SELECT\n      ${[...outerDimCols, ...outerAggItems].join(',\n      ')}\n` +
      `    FROM (\n` +
      `      SELECT DISTINCT\n        ${innerSelectItems.join(',\n        ')}\n` +
      `      FROM ${this.dialect.quoteIdentifier('main')}\n` +
      `${indentedJoins}` +
      `${indentedWhere}\n` +
      `    ) ${this.dialect.quoteIdentifier('_dedup')}\n` +
      outerGroupByLine +
      `  )`;

    return { cteName, pulls, dimRefs, sql, params: where.params };
  }

  /**
   * Builds a "metric sleeve" CTE for one joined metric: it re-joins `main` with the raw
   * (pre-dedup) CTEs — bypassing the parent-key dedup that the normal `<alias>`
   * aggregation CTE applies — and re-aggregates at the REPORT dimension grain instead.
   * This is what makes a joined COUNT_DISTINCT/SUM/AVG correct: the dedup CTE already
   * collapsed to one row per parent-join-key, so aggregating there double/under-counts
   * relative to the report's actual GROUP BY.
   *
   * Two shapes, branched on `metric.function`:
   * - COUNT_DISTINCT: single-level `COUNT(DISTINCT metricRef)` at the dimension grain, assembled
   *   below over `buildCountingSleeveCte` — the same assembly a joined Unique Count uses.
   * - SUM/AVG (C2.2, "value sleeve"): a nested `SELECT DISTINCT (dims, owner __owox_rid,
   *   value)` subquery wrapped by an outer `SUM`/`AVG` — delegated to
   * `buildValueSleeveGroupCte` with a singleton one-metric group (1 generalized
   *   that shape to N metrics for the merged case; this keeps the singleton SQL byte-
   *   identical to before the merge, sharing ONE implementation with it). `__owox_rid` (C2.1) is
   *   the metric's owning chain's per-raw-row surrogate, so a value that fans out to
   *   multiple report rows is still counted at most once per PRE-fanout owner row.
   *
   * `<alias>_raw` CTEs already project every join key + blended field
   * (`collectSubsidiaryReferences`) and `main` projects join source keys
   * (`collectMainReferences`), so this JOINs the raw CTEs already defined for the normal
   * dedup path rather than defining new ones — a SQL-text reuse guarantee only. A
   * CTE-inlining engine may still physically re-scan the underlying source table once per
   * reference (this is not a claim about the execution plan).
   *
   * An empty `dimensions` list (a lone grand-total metric, no grouping) collapses the
   * sleeve to a single global row: no `GROUP BY` is emitted (at either nesting level for
   * the value-sleeve form) and `dimRefs` is empty — the caller (`buildBlendedQuery`) must
   * CROSS JOIN it instead of a dimension-tuple ON.
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
    mergedMetrics?: AggregationRule[]
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
        filterOpts
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
    filterOpts: SleeveFilterOptions = NO_SLEEVE_FILTERS
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
          `resolved joins, so the metric has no rows to read. Check that the Data Mart is still ` +
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
      const outerExpr = this.renderDimensionExpr(qualify(d), d, context);
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
   * Renders a dimension reference so a sleeve CTE's SELECT/GROUP BY stays identical
   * to the outer aggregated SELECT's rendering for the same column (extracted from the
   * date-trunc branch `renderAggregatedSelect` uses, so both paths can't drift apart).
   */
  renderDimensionExpr(ref: string, column: string, context: BlendedQueryContext): string {
    const { units, zones } = this.dateTruncMapsFor(context);
    const unit = units?.get(column);
    if (!unit) return ref;
    const renderer = this.dialect.clauseRenderer();
    if (!renderer) {
      // Returning `ref` here would drop the truncation silently, so the sleeve would group by
      // the raw column while the outer query groups by the truncated one — the join-back then
      // matches nothing. Unreachable from `buildBlendedQuery` (its capability guard rejects a
      // rendererless dialect long before), but this method is public.
      throw new Error(
        `renderDimensionExpr: dimension '${column}' carries a date-trunc unit but this storage ` +
          `has no clause renderer, so the truncation cannot be reproduced inside the sleeve`
      );
    }
    const type = context.columnTypes?.postJoin?.get(column);
    return renderer.renderDateTruncExpression(ref, unit, zones?.get(column), type);
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
