/**
 * The vocabulary, as a tuple, so `z.enum` consumes the SAME list the type is built from — a
 * hand-written `z.enum(['metric', 'column'])` beside this file would be a second source that drifts
 * the moment a level is added.
 */
export const CALCULATED_FIELD_LEVELS = ['metric', 'column'] as const;

/** A Calculated Field's level, derived from its formula — never chosen by the analyst. */
export type CalculatedFieldLevel = (typeof CALCULATED_FIELD_LEVELS)[number];

/**
 * Whether a level AGGREGATES. The ONE seat for that rule: it is asked while DERIVING a schema
 * field's level (`calculatedFieldLevelOf`, which asks the formula text first and this of the
 * recorded level second), of a composed plan (`hasAggregateCalculatedField`) and of a Totals
 * restriction dimension — on paths that differ from each other by a GROUP BY rather than by an
 * error, so a second copy would not fail, it would return a plausible wrong number.
 *
 * Spelled `!== 'column'` rather than `=== 'metric'` because the wire accepts a field carrying no
 * level at all, and aggregating is the behaviour every such field already had.
 */
export function isAggregateLevel(level: CalculatedFieldLevel | undefined): boolean {
  return level !== 'column';
}
