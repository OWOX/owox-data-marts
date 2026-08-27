import type { FilterRule } from '../schemas/filter-config.schema';

/** The SQL clause a filter rule's predicate belongs in. */
export type FilterClause = 'where' | 'having';

/**
 * A filter rule carrying the clause its predicate belongs in.
 *
 * NOT a wire field: `FilterRuleSchema` is what an API client sends, and the clause is a verdict the
 * server derives — accepting one would let a caller route its own predicate.
 *
 * `clause` is REQUIRED, and that is the whole guard: an optional stamp would let a new producer
 * forward `report.filterConfig` (a plain `FilterRule[]`) straight through and route an
 * aggregate-level Calculated Field's predicate into `WHERE`, where it is a warehouse error or, on
 * the non-aggregated branch, dropped outright. So the BUILDER OPTION types name this type and the
 * compiler refuses an unrouted list. The renderers keep taking plain `FilterRule[]`: they are also
 * called with hand-built rules, for which {@link filterClauseOf}'s fallback is the answer.
 */
export type RoutedFilterRule = FilterRule & { clause: FilterClause };

/**
 * The ONE seat that answers "WHERE or HAVING?" for a filter rule.
 *
 * `rule.function` cannot express the case: an AGGREGATE-level Calculated Field aggregates inside its
 * formula, so its rule carries no function and never can. One report can hold a function-less rule
 * belonging in WHERE and another belonging in HAVING — and a second copy of this rule would not
 * fail, it would put a predicate in the wrong clause or in none.
 *
 * An ABSENT stamp means "not routed", and there `rule.function` IS the answer — for the renderers,
 * which are public seats that may be handed hand-built rules. {@link RoutedFilterRule} being
 * required on the builder options is what guards a producer against forgetting to route.
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
