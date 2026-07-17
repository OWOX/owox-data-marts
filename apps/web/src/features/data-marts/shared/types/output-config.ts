import { z } from 'zod';
import { REPORT_AGGREGATE_FUNCTIONS } from './relationship.types';

export { PERCENTILE_FUNCTIONS, REPORT_AGGREGATE_FUNCTIONS } from './relationship.types';
export type { ReportAggregateFunction } from './relationship.types';

const ScalarValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const RelativeDatePresetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('today') }),
  z.object({ kind: z.literal('yesterday') }),
  z.object({ kind: z.literal('this_month') }),
  z.object({ kind: z.literal('last_month') }),
  z.object({ kind: z.literal('this_year') }),
  z.object({ kind: z.literal('last_n_days'), n: z.number().int().positive().max(3650) }),
  z.object({ kind: z.literal('last_n_months'), n: z.number().int().positive().max(3650) }),
]);

const ScalarOperatorEnum = z.enum([
  'eq',
  'neq',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'gt',
  'lt',
  'gte',
  'lte',
  'regex',
  'not_regex',
]);

const NoValueOperatorEnum = z.enum([
  'is_empty',
  'is_not_empty',
  'is_null',
  'is_not_null',
  'is_true',
  'is_false',
]);

const FilterRuleBaseSchema = z.discriminatedUnion('operator', [
  z.object({
    column: z.string().min(1),
    operator: ScalarOperatorEnum,
    value: ScalarValueSchema,
  }),
  z.object({
    column: z.string().min(1),
    operator: NoValueOperatorEnum,
  }),
  z.object({
    column: z.string().min(1),
    operator: z.literal('between'),
    value: z.object({ from: ScalarValueSchema, to: ScalarValueSchema }),
  }),
  z.object({
    column: z.string().min(1),
    operator: z.literal('relative_date'),
    value: RelativeDatePresetSchema,
  }),
]);

// Placement is optional — when absent, the rule is treated as 'post-join'.
const PlacementExtrasSchema = z.object({
  placement: z.enum(['pre-join', 'post-join']).optional(),
  // When set, the rule filters the AGGREGATED value of the column (HAVING) instead of
  // the raw rows (WHERE); the (column, function) pair must match a report aggregation.
  function: z.enum(REPORT_AGGREGATE_FUNCTIONS).optional(),
});

export const FilterRuleSchema = z.intersection(FilterRuleBaseSchema, PlacementExtrasSchema);

export const SortRuleSchema = z.object({
  column: z.string().min(1),
  direction: z.enum(['asc', 'desc']),
});

// Calendar bucket a date/timestamp dimension is truncated to. Mirror of the backend
// `DATE_TRUNC_UNITS` (apps/backend/src/data-marts/dto/schemas/date-trunc-config.schema.ts).
export const DATE_TRUNC_UNITS = ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'] as const;
export type DateTruncUnit = (typeof DATE_TRUNC_UNITS)[number];

// IANA time-zone shape. The backend inlines this into SQL as a string literal, so this
// pattern is a hard SQL-injection guard — mirror of the backend IANA_TIME_ZONE_PATTERN.
export const IANA_TIME_ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

export const AggregationRuleSchema = z.object({
  column: z.string().min(1),
  function: z.enum(REPORT_AGGREGATE_FUNCTIONS),
});

export const DateTruncRuleSchema = z.object({
  column: z.string().min(1),
  unit: z.enum(DATE_TRUNC_UNITS),
  timeZone: z.string().min(1).regex(IANA_TIME_ZONE_PATTERN, 'Invalid IANA time zone').optional(),
});

export type FilterRule = z.infer<typeof FilterRuleSchema>;
export type SortRule = z.infer<typeof SortRuleSchema>;
export type AggregationRule = z.infer<typeof AggregationRuleSchema>;
export type DateTruncRule = z.infer<typeof DateTruncRuleSchema>;
export type RelativeDatePreset = z.infer<typeof RelativeDatePresetSchema>;

export interface JoinedSourceColumn {
  /**
   * Unified blended-field name stored on the rule.
   * Flat: `category_details__item_count`. Nested (struct path): includes a hash suffix,
   * e.g. `category_details__item_event_count__a1b2c3d4`.
   */
  id: string;
  /** Raw original field name, for friendly display in the slice picker. */
  name: string;
  type: string;
  /** Business-readable name of the joined column (presentation only). */
  alias?: string;
}

export interface JoinedSource {
  aliasPath: string;
  title: string;
  /** Display name of the joined data mart (join alias or its title). */
  dataMartName?: string;
  columns: readonly JoinedSourceColumn[];
}

export interface OutputConfig {
  filterConfig: FilterRule[];
  sortConfig: SortRule[];
  limitConfig: number | null;
  aggregationConfig: AggregationRule[];
  dateTruncConfig: DateTruncRule[];
  uniqueCountConfig: boolean;
}

export const EMPTY_OUTPUT_CONFIG: OutputConfig = {
  filterConfig: [],
  sortConfig: [],
  limitConfig: null,
  aggregationConfig: [],
  dateTruncConfig: [],
  uniqueCountConfig: false,
};

export function hasAnyOutputControls(config: OutputConfig): boolean {
  return (
    config.filterConfig.length > 0 ||
    config.sortConfig.length > 0 ||
    config.limitConfig != null ||
    config.aggregationConfig.length > 0 ||
    config.dateTruncConfig.length > 0 ||
    config.uniqueCountConfig
  );
}

export function isPreJoinFilter(rule: FilterRule): boolean {
  return rule.placement === 'pre-join';
}
