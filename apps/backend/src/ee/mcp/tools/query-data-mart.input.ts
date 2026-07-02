import { z } from 'zod';
import type {
  FilterConfig,
  FilterRule,
} from '../../../data-marts/dto/schemas/filter-config.schema';
import { REPORT_AGGREGATE_FUNCTIONS } from '../../../data-marts/dto/schemas/aggregate-function.schema';
import type { AggregationConfig } from '../../../data-marts/dto/schemas/aggregation-config.schema';
import {
  DATE_TRUNC_UNITS,
  IANA_TIME_ZONE_PATTERN,
} from '../../../data-marts/dto/schemas/date-trunc-config.schema';
import type { DateTruncConfig } from '../../../data-marts/dto/schemas/date-trunc-config.schema';

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 20;

// Operators unsupported by the internal FilterRule are accepted here and rejected
// at mapping time with a precise error, rather than silently dropped.
export const McpOperatorEnum = z.enum([
  'eq',
  'neq',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'in',
  'not_in',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'is_null',
  'is_not_null',
  'before',
  'after',
  'in_last_n_days',
  'in_next_n_days',
  'this_week',
  'this_month',
  'this_year',
]);

const McpFilterSchema = z.object({
  field: z.string().min(1),
  operator: McpOperatorEnum,
  value: z.unknown().optional(),
});

const McpAggregationSchema = z.object({
  field: z.string().min(1),
  function: z.enum(REPORT_AGGREGATE_FUNCTIONS),
});

const McpDateBucketSchema = z.object({
  field: z.string().min(1),
  unit: z.enum(DATE_TRUNC_UNITS),
  time_zone: z.string().min(1).regex(IANA_TIME_ZONE_PATTERN, 'Invalid IANA time zone').optional(),
});

export const queryDataMartInputSchema = z
  .object({
    data_mart_id: z
      .string()
      .min(1)
      .describe(
        'ID of the data mart to query (from list_data_marts or get_data_mart_details_by_id).'
      ),
    fields: z
      .array(z.string().min(1))
      .min(1)
      .describe(
        'Exact field names to return, copied verbatim from get_data_mart_details_by_id. MUST include every field named in aggregations and date_buckets — a field you aggregate or bucket but omit here is rejected. Fields here that are neither aggregated nor bucketed become group-by dimensions.'
      ),
    slices: z
      .array(McpFilterSchema)
      .optional()
      .describe(
        "Pre-join filters: narrow a JOINED data mart before it is blended in. Criteria on a joined data mart's own fields only — never the main data mart."
      ),
    filters: z
      .array(McpFilterSchema)
      .optional()
      .describe(
        'Post-join filters on the blended result. May reference a field that is NOT in "fields" (e.g. filter on a column you do not display).'
      ),
    aggregations: z
      .array(McpAggregationSchema)
      .optional()
      .describe('Aggregations over a field. Each aggregated field must also appear in "fields".'),
    date_buckets: z
      .array(McpDateBucketSchema)
      .optional()
      .describe(
        'Bucket a date/timestamp field by DAY/WEEK/MONTH/QUARTER/YEAR. Each bucketed field must also appear in "fields".'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .optional()
      .describe('Max rows to return (1-1000, default 20). No offset/pagination.'),
  })
  .strict();

export type QueryDataMartInput = z.infer<typeof queryDataMartInputSchema>;
export { DEFAULT_LIMIT, MAX_LIMIT };

export const UNSUPPORTED_MCP_OPERATORS = ['in', 'not_in', 'in_next_n_days', 'this_week'] as const;
export const SUPPORTED_MCP_OPERATORS = McpOperatorEnum.options.filter(
  o => !(UNSUPPORTED_MCP_OPERATORS as readonly string[]).includes(o)
);

export class UnsupportedOperatorError extends Error {
  readonly operator: string;
  constructor(op: string) {
    super(`unsupported_operator: '${op}' is not supported in this version`);
    this.name = 'UnsupportedOperatorError';
    this.operator = op;
  }
}

export class UnsupportedAggregationError extends Error {
  constructor(fn: string) {
    super(`unsupported_aggregation: '${fn}' is not a supported aggregate function`);
    this.name = 'UnsupportedAggregationError';
  }
}

export class UnsupportedDateBucketError extends Error {
  constructor(unit: string) {
    super(
      `unsupported_date_bucket: '${unit}' is not a supported date-trunc unit. Supported: ${DATE_TRUNC_UNITS.join(', ')}`
    );
    this.name = 'UnsupportedDateBucketError';
  }
}

const DIRECT = new Set([
  'eq',
  'neq',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'gt',
  'gte',
  'lt',
  'lte',
  'is_null',
  'is_not_null',
]);

function mapOne(
  f: { field: string; operator: string; value?: unknown },
  placement: 'pre-join' | 'post-join'
): FilterRule {
  const base = { column: f.field, placement } as const;
  if (DIRECT.has(f.operator))
    return { ...base, operator: f.operator as never, value: f.value as never };
  switch (f.operator) {
    case 'before':
      return { ...base, operator: 'lt', value: f.value as never };
    case 'after':
      return { ...base, operator: 'gt', value: f.value as never };
    case 'between': {
      const bv = f.value as Record<string, unknown> | undefined;
      if (!bv || typeof bv !== 'object' || !('from' in bv) || !('to' in bv)) {
        throw new Error(`'between' value must be an object with 'from' and 'to' keys`);
      }
      return { ...base, operator: 'between', value: f.value as never };
    }
    case 'in_last_n_days': {
      const n = Number(f.value);
      if (Number.isNaN(n) || !Number.isInteger(n) || n <= 0) {
        throw new Error(
          `'in_last_n_days' value must be a positive integer, got: ${String(f.value)}`
        );
      }
      return {
        ...base,
        operator: 'relative_date',
        value: { kind: 'last_n_days', n },
      };
    }
    case 'this_month':
      return { ...base, operator: 'relative_date', value: { kind: 'this_month' } };
    case 'this_year':
      return { ...base, operator: 'relative_date', value: { kind: 'this_year' } };
    default:
      throw new UnsupportedOperatorError(f.operator); // in, not_in, in_next_n_days, this_week
  }
}

export function mapMcpFiltersToRules(
  slices: Array<{ field: string; operator: string; value?: unknown }> = [],
  filters: Array<{ field: string; operator: string; value?: unknown }> = []
): FilterConfig {
  const rules: FilterRule[] = [
    ...slices.map(s => mapOne(s, 'pre-join')),
    ...filters.map(f => mapOne(f, 'post-join')),
  ];
  return rules.length ? rules : null;
}

export function mapMcpAggregations(
  aggregations: Array<{ field: string; function: string }> = []
): AggregationConfig {
  if (!aggregations.length) return null;
  return aggregations.map(a => {
    if (!(REPORT_AGGREGATE_FUNCTIONS as readonly string[]).includes(a.function)) {
      throw new UnsupportedAggregationError(a.function);
    }
    return { column: a.field, function: a.function as (typeof REPORT_AGGREGATE_FUNCTIONS)[number] };
  });
}

export function mapMcpDateBuckets(
  date_buckets: Array<{ field: string; unit: string; time_zone?: string }> = []
): DateTruncConfig {
  if (!date_buckets.length) return null;
  return date_buckets.map(b => {
    if (!(DATE_TRUNC_UNITS as readonly string[]).includes(b.unit)) {
      throw new UnsupportedDateBucketError(b.unit);
    }
    return {
      column: b.field,
      unit: b.unit as (typeof DATE_TRUNC_UNITS)[number],
      ...(b.time_zone !== undefined ? { timeZone: b.time_zone } : {}),
    };
  });
}
