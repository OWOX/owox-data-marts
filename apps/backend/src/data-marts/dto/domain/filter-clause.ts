import type { FilterRule } from '../schemas/filter-config.schema';

/** The SQL clause a filter rule's predicate belongs in. */
export type FilterClause = 'where' | 'having';

/**
 * A filter rule carrying the clause its predicate belongs in (#6732, D21).
 *
 * NOT a wire field: `FilterRuleSchema` is what an API client sends, and the clause is a verdict the
 * server derives — accepting one would let a caller route its own predicate past the rules below.
 * The stamp is applied by `routeFilterClauses`, the one factory seat, and read by
 * {@link filterClauseOf}, the one reader.
 *
 * `clause` is REQUIRED, and that is the whole guard. A new producer of builder filters only has to
 * forward `report.filterConfig` — which is a `FilterRule[]` and would type-check perfectly against
 * an optional stamp — to route an aggregate-level Calculated Field's predicate into `WHERE`, where
 * it is either a warehouse error or, on the non-aggregated branch, dropped outright. So the
 * BUILDER OPTION types (`DataMartQueryOptions.filters`, `BlendedQueryContext.filters`) name this
 * type and the compiler refuses an unrouted list. The renderers keep taking plain `FilterRule[]`
 * on purpose: they are also called with hand-built rules, and for those the fallback in
 * {@link filterClauseOf} is exactly the pre-#6732 answer.
 */
export type RoutedFilterRule = FilterRule & { clause: FilterClause };

/**
 * The ONE seat that answers "WHERE or HAVING?" for a filter rule.
 *
 * `rule.function` used to answer it in five independent places, and it cannot express this case: an
 * AGGREGATE-level Calculated Field aggregates inside its formula, so its rule carries no function
 * and, by `AGGREGATION_ON_CALCULATED_METRIC`, never can. One report can hold a function-less rule
 * belonging in WHERE (a row-level formula) and another belonging in HAVING (an aggregate-level
 * one), and the field the five seats read cannot tell them apart. This is the D9 pattern the branch
 * already adopted for the grain (`isCalculatedGroupingKey`), for the same reason: the five seats
 * differ from one another by a clause rather than by an error, so a second copy of the rule does
 * not fail — it silently applies a predicate in the wrong place, or in none.
 *
 * An ABSENT stamp means "not routed", and for those `rule.function` IS the answer, exactly as it
 * was before this feature. That fallback is NOT the guard against a producer forgetting to route —
 * {@link RoutedFilterRule} being required on the builder option types is. It exists because the
 * renderers are public seats a caller may hand hand-built rules to, and refusing those would fail
 * every dialect spec without making one report more correct.
 */
export function filterClauseOf(rule: FilterRule): FilterClause {
  const routed = (rule as Partial<RoutedFilterRule>).clause;
  if (routed !== undefined) return routed;
  return rule.function ? 'having' : 'where';
}

/** Whether this rule's predicate belongs in HAVING — see {@link filterClauseOf}. */
export function isHavingFilterRule(rule: FilterRule): boolean {
  return filterClauseOf(rule) === 'having';
}

/** Whether this rule's predicate belongs in WHERE — see {@link filterClauseOf}. */
export function isWhereFilterRule(rule: FilterRule): boolean {
  return filterClauseOf(rule) === 'where';
}
