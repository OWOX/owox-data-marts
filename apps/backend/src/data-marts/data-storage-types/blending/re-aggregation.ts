import { AggregateFunction } from '../../dto/schemas/aggregate-function.schema';
import { categorizeFieldType } from '../../dto/schemas/field-type-category';

/**
 * Re-aggregation function for a passthrough field bubbling UP through the bottom-up CTE
 * tree (`buildSubtreeCtes`/`buildAggregationCte`) — i.e. how an intermediate ancestor
 * chain re-rolls a CHILD chain's already-aggregated blended field before it reaches
 * `main`, on a 2+ level (transitive) blend. This is the field's OWN declared pre-join
 * `aggregateFunction`, entirely separate from a report's post-join metric
 * (`context.aggregations`/`AggregationRule.function`): `renderAggregatedSelect` applies
 * that requested function directly and never calls this method, and a
 * joined (blended-column) SUM/AVG report metric is excluded from that path before it
 * gets there, routed through its value sleeve instead (see `collectSleeveMetrics` /
 * `buildSleeveCte`). What remains relevant here is non-blended/transitive passthrough
 * plumbing plus the COUNT/COUNT_DISTINCT/ANY_VALUE re-roll-ups below.
 */
export function reAggregateFunctionFor(aggregateFunction: AggregateFunction): AggregateFunction {
  switch (aggregateFunction) {
    case 'COUNT':
      // Correct: summing per-child-group row counts yields the total count.
      return 'SUM';
    case 'COUNT_DISTINCT':
      // KNOWN LIMITATION ( joined-DM aggregation): re-aggregating as SUM adds up the
      // per-child-group distinct counts, so on a 2+ level (transitive) blend a value present
      // in more than one child group is over-counted — this is NOT a true global distinct
      // count. Same class as the AVG avg-of-avgs case below; a correct transitive distinct
      // needs the raw values at the parent level (handle when joined-DM aggregation lands).
      return 'SUM';
    case 'ANY_VALUE':
      return 'MAX';
    default:
      // SUM/AVG here are a transitive blended field's OWN pre-join rollup passthrough —
      // not a report-level joined SUM/AVG metric (those are value-sleeve routed,
      // C2.3, and never reach this function). AVG re-aggregation in THIS passthrough
      // mechanism is still avg-of-avgs (a known limitation); handle when joined-DM
      // aggregation lands.
      return aggregateFunction;
  }
}

// Types MAX is defined for on every supported warehouse. BOOLEAN and the `other` category
// (JSON, ARRAY, STRUCT, GEOGRAPHY, VARIANT) are rejected by at least one of them.
const ORDERABLE_CATEGORIES = new Set(['number', 'string', 'date', 'time']);

/**
 * The pre-join roll-up to actually emit for a declared one.
 *
 * `ANY_VALUE` is non-deterministic, and the dedup CTE it produces is read TWICE — by the outer
 * GROUP BY and again inside every metric sleeve. Engines that inline a `WITH` evaluate each
 * reference separately, so the two can disagree and the sleeve's join-back on that value then
 * matches nothing: SUM/AVG come back NULL and COUNT DISTINCT a confident 0. `MAX` picks a stable
 * member of the same set. Without a resolvable type the declared function stands, since MAX is
 * not valid for every type.
 */
export function preJoinAggregateFunctionFor(
  aggregateFunction: AggregateFunction,
  fieldType?: string
): AggregateFunction {
  if (aggregateFunction !== 'ANY_VALUE' || !fieldType) return aggregateFunction;
  return ORDERABLE_CATEGORIES.has(categorizeFieldType(fieldType)) ? 'MAX' : aggregateFunction;
}
