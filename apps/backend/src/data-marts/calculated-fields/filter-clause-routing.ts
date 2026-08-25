import type { DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import type { FilterRule } from '../dto/schemas/filter-config.schema';
import type { FilterClause, RoutedFilterRule } from '../dto/domain/filter-clause';
import { calculatedFieldLevelOf, calculatedFieldsOf } from './calculated-field.utils';
import { isAggregateLevel } from './formula-level';

/**
 * Stamps each rule with the clause its predicate belongs in (#6732, D21) — the factory seat for
 * the verdict {@link filterClauseOf} reads everywhere downstream.
 *
 * Called from the four seats that decide a report's clauses: the three that hand its filters to a
 * builder — `ReportSqlComposerService.compose` and `.composeTotals`, and
 * `BlendedReportDataService.resolveBlendingDecision` — and `OutputControlsValidatorService`, which
 * validates against the same verdict so what it accepts and what the builder renders cannot
 * disagree. Idempotent, because the Totals path routes twice — `composeTotals` splits the report's
 * rules, then `compose` routes the plan it built.
 *
 * Two things put a predicate after the GROUP BY, and both are read here rather than downstream:
 * the rule's own `function` (the report aggregates an ordinary column, or a row-level formula it
 * grouped by — spec §2), and the FIELD's level (an AGGREGATE-level Calculated Field is already an
 * aggregate and carries no function). The level comes through `calculatedFieldLevelOf`, the one
 * seat for it: the recorded `level` is a cache (D13), so the formula's own text answers first.
 */
export function routeFilterClauses(
  filters: readonly FilterRule[] | undefined,
  schemaFields: readonly DataMartSchemaField[]
): RoutedFilterRule[] {
  const rules = filters ?? [];
  if (rules.length === 0) return [];
  const aggregateLevelNames = new Set(
    calculatedFieldsOf(schemaFields)
      .filter(f => isAggregateLevel(calculatedFieldLevelOf(f, schemaFields)))
      .map(f => f.name)
  );
  return rules.map(rule => {
    const clause: FilterClause =
      rule.function || aggregateLevelNames.has(rule.column) ? 'having' : 'where';
    return { ...rule, clause };
  });
}
