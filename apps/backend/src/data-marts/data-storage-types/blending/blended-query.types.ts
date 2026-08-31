import { AggregateFunction } from '../../dto/schemas/aggregate-function.schema';
import { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { ResolvedRelationshipChain } from '../interfaces/blended-query-builder.interface';
import {
  CalculatedFieldRenderOptions,
  CalculatedFieldPlan,
  CalculatedPredicateOperand,
  ColumnTypeResolver,
  SqlParameter,
} from '../utils/sql-clause-renderer';

/** One node of the blend tree: a chain plus the chains that join INTO it. */
export interface BlendTreeNode {
  chain: ResolvedRelationshipChain;
  children: BlendTreeNode[];
}

/**
 * A child chain's blended field as seen by an ANCESTOR chain: it is already aggregated by
 * the child's own CTE, so the ancestor re-rolls it (see `getReAggregateFunction`).
 */
export interface PassthroughField {
  outputAlias: string;
  aggregateFunction: AggregateFunction;
  isHidden: boolean;
}

// COUNT_DISTINCT metrics that share an owner chain — and therefore the same
// joins, WHERE and GROUP BY — computed by ONE CTE with one aggregate per metric. Dimensions are
// report-wide for this shape, so unlike `ValueSleeveGroup` the key is the owner alone.
export interface CountDistinctSleeveGroup {
  ownerCteName: string;
  metrics: AggregationRule[];
}

// a set of SUM/AVG value-sleeve metrics that share the SAME owner chain +
// dimensions — and therefore the SAME `DISTINCT (dims, owner __owox_rid, value)` dedup set — so
// they can be computed by ONE merged sleeve CTE instead of one dedup pass each. See
// `groupValueSleeveMetrics` / `buildValueSleeveGroupCte`.
export interface ValueSleeveGroup {
  ownerCteName: string;
  dimensions: string[];
  metrics: AggregationRule[];
}

/**
 * One aggregate call lifted out of a calculated field's formula. `valueSql` is the call's
 * ARGUMENT rendered against the owner's raw columns; the sleeve dedups it per owner row and
 * aggregates it with `fn`.
 *
 * Deliberately NOT a widening of `ValueSleeveGroup`: v1 builds one sleeve per aggregate call with
 * no merging, so it needs neither the multi-column slot map nor the merge key — and `fn` is any
 * aggregate the warehouse's own dialect offers (`FormulaFunctionDialect`), not the report
 * builder's closed `ReportAggregateFunction` picklist.
 */
export interface FormulaSleeveGroup {
  ownerCteName: string;
  dimensions: string[];
  fn: string;
  /**
   * The ANSI quantifier of `COUNT(DISTINCT x)`, lifted off the argument by `planFormulaSleeves`. It
   * belongs to the OUTER aggregate: inside the deduped slot it is a syntax error, and the inner
   * `DISTINCT (dims, identity, value)` pass does NOT already imply it — that pass keeps one row per
   * owner ROW, while this counts distinct VALUES across them.
   */
  distinct?: boolean;
  /**
   * Whether `valueSql` reads the owner's RAW rows (`<owner>_raw`, the fan-out identity source) or
   * the values its pre-join roll-up already collapsed per join key (`<owner>`). Defaults to raw.
   *
   * The caller decides because only it can see which FIELDS the expression reads; the same
   * `isIdentityPreJoinField` classification the value-sleeve path branches on. A field's declared
   * pre-join `aggregateFunction` is what that field MEANS once blended, so a formula naming it must
   * read the same value a report metric on it would — see `buildFormulaSleeveCte`.
   */
  isIdentity?: boolean;
  valueSql: string;
  /** Output alias of the single pull this sleeve feeds. */
  alias: string;
  /**
   * The calculated field this sleeve serves, for refusals the ANALYST reads.
   *
   * `alias` is a synthetic pull name (`_fx_<metric>_<i>`) that appears nowhere in their schema, so
   * a message naming it sends them looking for a field that does not exist. Optional because a
   * caller assembling a group by hand — the builder's own specs — has no metric to name; the
   * refusal then falls back to `alias`, which is at least a string the caller recognises.
   */
  metricOutputName?: string;
}

// One output column a sleeve CTE feeds: the outer query emits `ANY_VALUE(<cte>.<alias>) AS <alias>`
// for each.
export interface SleevePull {
  // The report metric this pull computes. Absent for a joined source's Unique Count, which is
  // declared by `uniqueCountSources` rather than by an aggregation rule.
  metric?: AggregationRule;
  alias: string;
  /**
   * Whether an empty join-back must read as 0 instead of NULL. True for the COUNTING shapes: the
   * sleeve's own COUNT is already correct (0 over zero rows), but the outer `ANY_VALUE` over the
   * join-back returns NULL whenever the outer FROM contributes no row for a group. SUM/AVG stay
   * bare — NULL-over-empty is their correct semantics, and coalescing would report "no data" as a
   * genuine zero.
   */
  coalesceEmptyToZero: boolean;
}

/**
 * The ROW-LEVEL calculated fields a sleeve's grain carries, on a channel PARALLEL to its
 * `dimensions` list rather than inside it.
 *
 * The list itself stays `string[]` and a row-level field contributes its output NAME, because ten
 * of that list's eleven consumers need a resolvable name — and the eleventh,
 * `groupValueSleeveMetrics`' merge key, joins the list into a string, where an object element
 * would stringify to `[object Object]` for every entry and silently merge two different grains
 * into ONE sleeve. That is the only consumer in the set that fails quietly; the rest fail loudly.
 *
 * `renderOptions` must be the SAME object the outer SELECT renders its own calculated fields with.
 * The sleeve joins back on the dimension tuple, so its projected expression has to equal the outer
 * GROUP BY key byte for byte; one method called with one options object gives that by
 * construction, while two derivations give it only until one of them changes — and the join-back
 * then matches nothing.
 */
export interface SleeveCalculatedDimensions {
  /**
   * The plans that are GROUPING KEYS (`isCalculatedGroupingKey`), by output name, in the order
   * `renderAggregatedSelect` emits their keys. Row-level is not enough: a row-level field the
   * report aggregates is not a key, and one left in here gives every sleeve a finer grain than the
   * outer query — `MetricSleeveBuilder.buildAll` refuses that rather than emitting it.
   */
  plans: ReadonlyMap<string, CalculatedFieldPlan>;
  renderOptions: CalculatedFieldRenderOptions;
}

// One built sleeve CTE (COUNT_DISTINCT, single-metric value sleeve, a merged multi-metric
// value-sleeve group, or a joined source's Unique Count) plus every output column it feeds.
// `pulls.length` is 1 for all but a merged group — the caller emits ONE `ANY_VALUE` SELECT item per
// pull but only ONE join-back per `SleeveResult` (that single join-back, shared across every
// pull, is the point of merging).
export interface SleeveResult {
  cteName: string;
  pulls: SleevePull[];
  dimRefs: { column: string; outer: string; sleeve: string }[];
  /**
   * Set when this sleeve computes ONE aggregate call of a calculated field's formula. Its pull is
   * SPLICED into that metric's own expression at the call's site, so the caller must not emit it as
   * an outer SELECT item of its own — that would project half a metric under a name no header
   * claims. Everything else about it (the join-back, the grain assertions) is identical.
   */
  formulaCall?: { metricOutputName: string; callIndex: number };
  sql: string;
  // bound params from the post-join WHERE rendered INSIDE this sleeve. The
  // caller appends them to `cteParams` at the point the sleeve CTE is added to the WITH
  // clause, so positional (Athena `?`) binding stays aligned with WITH-clause order.
  params: SqlParameter[];
}

// the post-join WHERE a sleeve subquery must reproduce so its metric is computed
// over the SAME filtered set as the outer query. The sleeve pulls its value via
// `ANY_VALUE(sleeve.alias)` — a constant per dimension group the outer WHERE cannot reach —
// so the filter must run INSIDE the sleeve too. `whereParamPrefix` is unique per sleeve so
// named-parameter dialects (BigQuery `@name`) don't collide across sleeves; `resolveColumnType`
// is the SAME resolver the outer WHERE uses so a date/HAVING cast matches byte-for-byte.
export interface SleeveFilterOptions {
  filters: FilterRule[];
  resolveColumnType?: ColumnTypeResolver;
  whereParamPrefix: string;
  /**
   * The SAME `buildCalculatedPredicateExpressions` map the outer WHERE uses: a filter on a
   * Calculated Field compares its FORMULA, and the field's name is a SELECT alias no CTE projects.
   * Without it the sleeve emitted `main.<field>` over a `main` CTE that correctly carries no such
   * column — and a sleeve that cannot apply the report's predicate is the shape #6766's Critical C1
   * shipped: the joined metric computed over the UNFILTERED rows.
   */
  calculatedExpressions?: ReadonlyMap<string, CalculatedPredicateOperand>;
  /**
   * The restriction to the groups a Totals query keeps (see `GroupRestriction`). The sleeve reads
   * raw rows, so without it a COUNT DISTINCT would count entities whose group the report's metric
   * filter hides.
   *
   * `dimensions` travels WITH the join line and is not decoration: the join's left-hand side
   * resolves each dimension through the same qualifier the outer query uses (`<dedupCte>.<col>`),
   * so the sleeve must join those dedup CTEs too. A Totals sleeve has no dimensions of its own, so
   * nothing else would pull them in — the emitted subquery would reference a CTE absent from its
   * own FROM.
   */
  keptGroups?: { join: string; dimensions: string[] };
}

// Frozen: it is the DEFAULT argument of two public methods, so a caller that mutated it would
// change what every other caller sees for the rest of the process.
export const NO_SLEEVE_FILTERS: SleeveFilterOptions = Object.freeze({
  filters: [],
  whereParamPrefix: 'p',
});

// Reserved projected-column name for the per-raw-row surrogate id (C2.1). A value-sleeve
// owner's `<alias>_raw` CTE projects it as `... AS __owox_rid`; the value sleeve's IDENTITY
// branch (`isIdentityPreJoinField`,) reads it back as `<ownerCte>_raw.__owox_rid` for
// the owner-identity leg of `DISTINCT (dim, __owox_rid, value)`. A non-identity owner's raw CTE
// does NOT project it at all — see `collectValueSleeveOwnerCtes`. `buildRawCte` guards this
// name against colliding with a real column reference.
export const ROW_SURROGATE_ALIAS = '__owox_rid';

// The kept-groups CTE name lives in `../utils/kept-groups.utils` — the flat renderer needs the
// same constant, and this module is blended-only.
