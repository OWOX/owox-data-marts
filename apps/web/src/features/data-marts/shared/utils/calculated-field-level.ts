import type { CalculatedFieldLevel } from '../types/data-mart-schema.types';

/** Anything carrying a calculated field's derived level — a `CalculatedFieldConfig`, in practice. */
interface WithOptionalLevel {
  level?: CalculatedFieldLevel;
}

/**
 * Whether a calculated field's formula is ROW-LEVEL: it computes per row, so the field IS a
 * dimension and a report may also apply an aggregation to it. The other level already aggregates
 * and can never be aggregated again.
 *
 * An ABSENT level reads as an aggregate, the same way the backend's own `isAggregateLevel` does.
 * The level is derived by the save, so a field authored in this session carries none yet — and the
 * aggregate reading is the one that offers nothing, so a guess here can never offer a control the
 * next response takes away.
 */
export function isRowLevelCalculatedField(calculated: WithOptionalLevel | undefined): boolean {
  return calculated?.level === 'column';
}
