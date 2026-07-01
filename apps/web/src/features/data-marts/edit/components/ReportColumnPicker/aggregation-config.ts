import type {
  AggregationRule,
  DateTruncRule,
  DateTruncUnit,
} from '../../../shared/types/output-config';
import type { ReportAggregateFunction } from '../../../shared/types/relationship.types';
import type { AggregationDraft } from './AggregationEditorPopover';

/**
 * Apply the per-field popover draft for ONE column to the shared aggregation +
 * date-trunc configs. A column carries either several aggregate functions (each
 * an extra output column) OR a single date-trunc bucket — never both. Rules for
 * OTHER columns are preserved in their original order; this column's rules are
 * rewritten (existing ones dropped, the draft's functions re-appended).
 */
export function applyAggregationDraft(
  column: string,
  draft: AggregationDraft,
  aggregationConfig: readonly AggregationRule[],
  dateTruncConfig: readonly DateTruncRule[]
): { aggregationConfig: AggregationRule[]; dateTruncConfig: DateTruncRule[] } {
  const otherAggregations = aggregationConfig.filter(rule => rule.column !== column);
  const nextAggregations: AggregationRule[] = [
    ...otherAggregations,
    ...draft.functions.map(fn => ({ column, function: fn })),
  ];

  const otherTrunc = dateTruncConfig.filter(rule => rule.column !== column);
  const nextTrunc: DateTruncRule[] =
    draft.bucket !== null
      ? [
          ...otherTrunc,
          // Only attach timeZone when set — keeps the rule byte-identical to the
          // no-tz shape (and the backend SQL unchanged) when no conversion is chosen.
          {
            column,
            unit: draft.bucket,
            ...(draft.timeZone !== null ? { timeZone: draft.timeZone } : {}),
          },
        ]
      : otherTrunc;

  return { aggregationConfig: nextAggregations, dateTruncConfig: nextTrunc };
}

/** Functions currently assigned to a column, in config order. */
export function functionsForColumn(
  column: string,
  aggregationConfig: readonly AggregationRule[]
): ReportAggregateFunction[] {
  return aggregationConfig.filter(rule => rule.column === column).map(rule => rule.function);
}

/** Date-trunc bucket currently assigned to a column, or null. */
export function bucketForColumn(
  column: string,
  dateTruncConfig: readonly DateTruncRule[]
): DateTruncUnit | null {
  return dateTruncConfig.find(rule => rule.column === column)?.unit ?? null;
}

/** Date-trunc time zone currently assigned to a column's bucket, or null. */
export function timeZoneForColumn(
  column: string,
  dateTruncConfig: readonly DateTruncRule[]
): string | null {
  return dateTruncConfig.find(rule => rule.column === column)?.timeZone ?? null;
}
