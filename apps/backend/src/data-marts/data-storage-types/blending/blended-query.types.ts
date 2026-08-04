import { AggregateFunction } from '../../dto/schemas/aggregate-function.schema';
import { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { ResolvedRelationshipChain } from '../interfaces/blended-query-builder.interface';
import { ColumnTypeResolver, SqlParameter } from '../utils/sql-clause-renderer';

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

// One built sleeve CTE (COUNT_DISTINCT, single-metric value sleeve, or a merged multi-metric
// value-sleeve group) plus every metric it feeds. `pulls.length` is 1 for the first two cases
// and 2+ for a merged group — the caller emits ONE `ANY_VALUE` SELECT item per pull but only
// ONE join-back per `SleeveResult` (that single join-back, shared across every
// pull, is the point of merging).
export interface SleeveResult {
  cteName: string;
  pulls: { metric: AggregationRule; alias: string }[];
  dimRefs: { column: string; outer: string; sleeve: string }[];
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
