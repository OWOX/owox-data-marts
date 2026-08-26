import { DateTruncRule } from '../schemas/date-trunc-config.schema';
import { FilterRule } from '../schemas/filter-config.schema';
import type { RoutedFilterRule } from './filter-clause';
import type { CalculatedFieldPlan } from '../../data-storage-types/utils/sql-clause-renderer';

/**
 * Restricts a Totals query to the rows of the GROUPS its report keeps.
 *
 * Totals have no GROUP BY, so the report's metric (HAVING) filters have nothing to filter there
 * — and dropping them makes Totals summarise rows the report itself hides. The builders instead
 * recompute the surviving groups over the SAME source and semi-join them: a GROUP BY result has
 * distinct tuples, so it filters rows without duplicating any, and every metric is then computed
 * over the surviving ROWS. That is what keeps a symmetric aggregate right — an entity present in
 * two surviving groups still counts once.
 *
 * ONE declaration shared by the read plan, the flat query options and the blended context: the
 * three carry the same tuple to two independent renderers, and a field added to only one of them
 * (as `dateTruncs` was, at first) silently changes the grain the HAVING is evaluated at.
 */
export interface GroupRestriction {
  /**
   * The report's own dimensions — the grain its HAVING filtered. A ROW-LEVEL calculated field is
   * one of them, listed here under its output name and rendered from `calculatedDimensions`
   * below; an AGGREGATE-level one never is (it is a metric, not a key).
   */
  dimensions: string[];
  /**
   * The plans behind the ROW-LEVEL entries of `dimensions`, in the order they appear there.
   *
   * A calculated field has no warehouse column behind it, so the renderer needs the FORMULA, not
   * the name — `renderAggregatedSelect` handed a bare `session_key` emits an `Unrecognized name`
   * on every dialect. Leaving the field out of the restriction entirely is the other failure and
   * the quieter one: the kept-groups CTE then regroups at a COARSER grain than the report, so the
   * metric filter keeps a different row set than the report shows.
   *
   * An aggregate-level plan here is INERT (no key, no projection) rather than an error, so the
   * emitted keys are a FILTERED SUBSEQUENCE of this list — the renderer derives the positional
   * dimension list from the same filter, never from this array's own indices.
   */
  calculatedDimensions?: CalculatedFieldPlan[];
  /**
   * The rules whose predicate belongs AFTER the GROUP BY; the WHERE rules stay in `filters`.
   *
   * NOT "the rules carrying a `function`" — that reading is what made this the silent seat.
   * An AGGREGATE-level Calculated Field aggregates inside its formula, so its rule carries no
   * function and never can (`AGGREGATION_ON_CALCULATED_FIELD`); read that way, a report whose only
   * metric filter is one built NO restriction at all — `renderKeptGroupsJoin` early-returns on an
   * empty `having` — and Totals summarised rows the report hides, with no error. The producer
   * (`composeTotals`) fills this from the clause `routeFilterClauses` stamped on each rule, and the
   * two renderers read the same stamp through `filterClauseOf`.
   *
   * A rule naming a Calculated Field is rendered from `calculatedHavingMetrics` below, never from
   * `calculatedDimensions` — that list keeps only the grouping keys, so neither shape of such a
   * rule has a plan there and the subquery would compare the field's NAME.
   */
  having: FilterRule[];
  /**
   * The plans behind the `having` rules that name a Calculated Field, in rule order.
   *
   * Both shapes need one, for different halves of the left-hand side. A rule carrying a FUNCTION
   * aggregates a row-level field the report aggregates, so the restriction must compare the same
   * ARGUMENT the report's own aggregate was given — the substituted formula cast to the declared
   * type — and re-deriving it from `calculatedDimensions` is impossible (an aggregated
   * plan is not a key and never travels there) while re-deriving it from the predicate expressions
   * would be a THIRD spelling: those are cast per OPERATOR, not per function, so `MIN` would gain a
   * cast the projection does not have. A function-LESS rule is an aggregate-level field, whose
   * formula already IS the aggregate and reaches the renderer through the predicate map instead.
   *
   * Absent, the function branch fell back to `qualifyColumn(rule.column)` and emitted
   * `SUM("ctr")` over a FROM that has no `ctr`: the report itself stayed correct and the Totals row
   * silently vanished, since both Totals callers swallow the warehouse error.
   */
  calculatedHavingMetrics?: CalculatedFieldPlan[];
  /**
   * The report's own date buckets for those dimensions. REQUIRED for correctness, not an
   * optimisation: a Totals query carries no `dateTruncs` of its own (it has no GROUP BY), so
   * without them the surviving groups would be recomputed at the RAW grain — `GROUP BY date`
   * where the report grouped by month — and a month whose total clears the filter can have no
   * single day that does. Omitted only when the report has no date bucket at all.
   */
  dateTruncs?: DateTruncRule[];
}

/**
 * A restriction whose `having` rules have already been ROUTED — what a read plan and
 * the two builder facades take.
 *
 * `having` is the third path into `renderHaving` beside the two `filters` channels, and its
 * producer (`composeTotals`) is the seat the silent failure lived at. Requiring the verdict here
 * means a future producer of a restriction cannot omit it without the build refusing.
 */
export type RoutedGroupRestriction = Omit<GroupRestriction, 'having'> & {
  having: RoutedFilterRule[];
};
