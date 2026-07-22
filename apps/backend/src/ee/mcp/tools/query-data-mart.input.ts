import { z } from 'zod';
import type {
  FilterConfig,
  FilterRule,
} from '../../../data-marts/dto/schemas/filter-config.schema';
import type { ReportAggregateFunction } from '../../../data-marts/dto/schemas/aggregate-function.schema';
import type { AggregationConfig } from '../../../data-marts/dto/schemas/aggregation-config.schema';
import {
  DATE_TRUNC_UNITS,
  IANA_TIME_ZONE_PATTERN,
} from '../../../data-marts/dto/schemas/date-trunc-config.schema';
import type { DateTruncConfig } from '../../../data-marts/dto/schemas/date-trunc-config.schema';
import type { SortConfig } from '../../../data-marts/dto/schemas/sort-config.schema';

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 20;

// Operators unsupported by the internal FilterRule are accepted here and rejected
// at mapping time with a precise error, rather than silently dropped.
const MCP_OPERATORS = [
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
] as const;

export const McpOperatorEnum = z.enum(MCP_OPERATORS);

// Fresh instance per use — a shared one becomes a JSON-Schema $ref that OpenAI can't resolve (filters → any[]).
// Also reused by add_report/update_report so report filters speak the exact same vocabulary as query filters.
export const makeMcpFilterSchema = () =>
  z.object({
    field: z.string().min(1),
    operator: z.enum(MCP_OPERATORS),
    value: z
      .union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.unknown()),
        z.record(z.unknown()),
        z.null(),
      ])
      .optional(),
  });

// The MCP tool advertises only these functions (tool description + docs/mcp.md). A strict subset of
// REPORT_AGGREGATE_FUNCTIONS — STRING_AGG and ANY_VALUE are intentionally NOT exposed, so the input
// schema and the documented contract agree. The `satisfies` guard fails to compile if a name drifts
// out of the report set.
export const MCP_AGGREGATE_FUNCTIONS = [
  'SUM',
  'COUNT',
  'COUNT_DISTINCT',
  'AVG',
  'MIN',
  'MAX',
  'P25',
  'P50',
  'P75',
  'P95',
] as const satisfies readonly ReportAggregateFunction[];

// Fresh instances per use, same as makeMcpFilterSchema — and reused by
// add_report/update_report so report output controls share the query vocabulary.
export const makeMcpAggregationSchema = () =>
  z.object({
    field: z.string().min(1),
    function: z.enum(MCP_AGGREGATE_FUNCTIONS),
  });

export const makeMcpDateBucketSchema = () =>
  z.object({
    field: z.string().min(1),
    unit: z.enum(DATE_TRUNC_UNITS),
    time_zone: z.string().min(1).regex(IANA_TIME_ZONE_PATTERN, 'Invalid IANA time zone').optional(),
  });

export const makeMcpSortSchema = () =>
  z.object({
    field: z.string().min(1),
    direction: z.enum(['asc', 'desc']),
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
        'Exact field names to return, copied verbatim from get_data_mart_details_by_id. MUST include every field named in aggregations, date_buckets, and sort — a field you aggregate, bucket, or sort but omit here is rejected. Fields here that are neither aggregated nor bucketed become group-by dimensions.'
      ),
    slices: z
      .array(makeMcpFilterSchema())
      .optional()
      .describe(
        "Pre-join filters: narrow a JOINED data mart before it is blended in. Criteria on a joined data mart's own fields only — never the main data mart."
      ),
    filters: z
      .array(makeMcpFilterSchema())
      .optional()
      .describe(
        'Post-join filters on the blended result. May reference a field that is NOT in "fields" (e.g. filter on a column you do not display).'
      ),
    aggregations: z
      .array(makeMcpAggregationSchema())
      .optional()
      .describe('Aggregations over a field. Each aggregated field must also appear in "fields".'),
    date_buckets: z
      .array(makeMcpDateBucketSchema())
      .optional()
      .describe(
        'Bucket a date/timestamp field by DAY/WEEK/MONTH/QUARTER/YEAR. Each bucketed field must also appear in "fields".'
      ),
    sort: z
      .array(makeMcpSortSchema())
      .optional()
      .describe(
        'Order the result rows. Each rule is { field, direction } with direction "asc" or "desc"; rules apply in order (the first is the primary key). Each sorted field must also appear in "fields".'
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
    if (!(MCP_AGGREGATE_FUNCTIONS as readonly string[]).includes(a.function)) {
      throw new UnsupportedAggregationError(a.function);
    }
    return { column: a.field, function: a.function as ReportAggregateFunction };
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

export function mapMcpSort(
  sort: Array<{ field: string; direction: 'asc' | 'desc' }> = []
): SortConfig {
  if (!sort.length) return null;
  return sort.map(s => ({ column: s.field, direction: s.direction }));
}
