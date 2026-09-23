import { z } from 'zod';

export const AUTO_AGGREGATION_OPT_OUT_MAX_COLUMNS = 500;

/**
 * Projected columns the analyst removed an aggregation from. Stored because an empty
 * `aggregationConfig` is also what the auto-collapse resolver reads as "not decided yet", so
 * without it a removed automatic aggregation is chosen again on the next run.
 */
export const AutoAggregationOptOutSchema = z
  .array(z.string().min(1))
  .max(AUTO_AGGREGATION_OPT_OUT_MAX_COLUMNS)
  .nullable();

export type AutoAggregationOptOut = z.infer<typeof AutoAggregationOptOutSchema>;

/** `[]` and `null` mean the same thing; one stored shape keeps change detection honest. */
export function foldEmptyAutoAggregationOptOut(
  value: AutoAggregationOptOut | undefined
): string[] | null {
  if (!value?.length) return null;
  return [...new Set(value)];
}

export const AUTO_AGGREGATION_OPT_OUT_OPENAPI = {
  type: 'array',
  nullable: true,
  maxItems: AUTO_AGGREGATION_OPT_OUT_MAX_COLUMNS,
  items: { type: 'string' },
  description:
    'Columns whose aggregation the analyst removed. While any of them is selected, the report is ' +
    'never collapsed automatically and returns its rows as stored. Omit to keep the stored value.',
} as const;
