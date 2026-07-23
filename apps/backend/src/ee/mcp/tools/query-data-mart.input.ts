import { z } from 'zod';
import {
  IN_LIST_MAX_VALUES,
  RELATIVE_DATE_MAX_N,
  type FilterConfig,
  type FilterRule,
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
  'is_empty',
  'is_not_empty',
  'is_null',
  'is_not_null',
  'before',
  'after',
  'in_last_n_days',
  'in_next_n_days',
  'this_week',
  'last_week',
  'this_month',
  'this_quarter',
  'last_quarter',
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
      .optional()
      .describe(
        'Operand for the operator: scalar for comparisons; {from, to} for between; array of scalars for in/not_in; positive integer for in_last_n_days/in_next_n_days; omit for is_null/is_not_null/is_empty/is_not_empty and the this_/last_ calendar presets.'
      ),
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

// Every advertised operator maps to the internal FilterRule.
export const SUPPORTED_MCP_OPERATORS = McpOperatorEnum.options;

/**
 * The full operator menu for boolean fields. eq/neq appear here because mapOne
 * translates them (with a boolean value) to the internal is_true/is_false — keep
 * this constant next to that translation so the advertised menu and the mapping
 * cannot drift apart. Consumed by the field-type matrix and the details tool.
 */
export const BOOLEAN_MCP_OPERATORS = ['eq', 'neq', 'is_null', 'is_not_null'] as const;

/**
 * Runtime guard for direct facade callers: mapOne takes `operator: string`, so a
 * caller that bypasses the zod enum can still hand it an unknown operator. Every
 * enum operator maps, so this is unreachable through the MCP tool itself.
 */
export class UnsupportedOperatorError extends Error {
  readonly operator: string;
  constructor(op: string) {
    super(`unsupported_operator: '${op}' is not supported in this version`);
    this.name = 'UnsupportedOperatorError';
    this.operator = op;
  }
}

/**
 * Single construction site for the client-facing unsupported-operator message,
 * shared by query_data_mart and the report tools so the copies cannot drift.
 * Every enum operator maps today, so this only fires for a raw operator string
 * from a direct facade caller (or a future enum addition shipped ahead of its
 * mapping) — keep the guidance operator-agnostic.
 */
export function unsupportedOperatorMessage(op: string): string {
  return (
    `Filter operator '${op}' is not supported. Supported operators: ` +
    `${SUPPORTED_MCP_OPERATORS.join(', ')}. Pick the closest supported operator and retry.`
  );
}

/**
 * A supported operator was given a malformed operand (wrong shape, empty list, …).
 * Distinct from UnsupportedOperatorError so the tool can answer "fix the value"
 * instead of "pick another operator" — and from a plain Error so the precise
 * reason is not swallowed by the generic query_failed fallback.
 */
export class InvalidFilterValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFilterValueError';
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
  'is_empty',
  'is_not_empty',
  'is_null',
  'is_not_null',
]);

function mapOne(
  f: { field: string; operator: string; value?: unknown },
  placement: 'pre-join' | 'post-join'
): FilterRule {
  const base = { column: f.field, placement } as const;
  // Boolean columns only accept is_true/is_false internally, but 'eq true' is what
  // callers naturally write — translate it. Only for a real boolean value: a string
  // "true" must stay 'eq' so a boolean column rejects it with a type-targeted error.
  if ((f.operator === 'eq' || f.operator === 'neq') && typeof f.value === 'boolean') {
    const wantsTrue = f.operator === 'eq' ? f.value : !f.value;
    return { ...base, operator: wantsTrue ? 'is_true' : 'is_false' };
  }
  if (DIRECT.has(f.operator))
    return { ...base, operator: f.operator as never, value: f.value as never };
  switch (f.operator) {
    case 'before':
      return { ...base, operator: 'lt', value: f.value as never };
    case 'after':
      return { ...base, operator: 'gt', value: f.value as never };
    case 'in':
    case 'not_in': {
      const list = f.value;
      if (!Array.isArray(list) || list.length === 0) {
        throw new InvalidFilterValueError(
          `'${f.operator}' value must be a non-empty array of strings or numbers`
        );
      }
      if (list.length > IN_LIST_MAX_VALUES) {
        throw new InvalidFilterValueError(
          `'${f.operator}' value list is too long (${list.length}); at most ${IN_LIST_MAX_VALUES} values are allowed`
        );
      }
      // No column category permits in/not_in on booleans, and a boolean list on any
      // other column type dies only in the warehouse — steer to the boolean operators.
      if (list.some(v => typeof v === 'boolean')) {
        throw new InvalidFilterValueError(
          `'${f.operator}' values must be strings or numbers — for a boolean condition use 'eq'/'neq' with a single true or false value`
        );
      }
      if (
        !list.every(v => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))
      ) {
        throw new InvalidFilterValueError(
          `'${f.operator}' values must all be strings or finite numbers`
        );
      }
      // Mixed types die in the warehouse (BigQuery types each bound param from its JS
      // value → "No matching signature for operator IN") — reject with a precise error here.
      const firstType = typeof list[0];
      if (!list.every(v => typeof v === firstType)) {
        throw new InvalidFilterValueError(
          `'${f.operator}' values must all be the same type (all strings or all numbers) — got a mix`
        );
      }
      return { ...base, operator: f.operator, value: list as never };
    }
    case 'between': {
      const bv = f.value as Record<string, unknown> | undefined;
      if (!bv || typeof bv !== 'object' || !('from' in bv) || !('to' in bv)) {
        throw new InvalidFilterValueError(
          `'between' value must be an object with 'from' and 'to' keys`
        );
      }
      // Mismatched bound types die only at query time on param-binding storages —
      // reject here with a precise error (mirrors the schema-level refine).
      if (typeof bv.from !== typeof bv.to) {
        throw new InvalidFilterValueError(
          `'between' bounds must be the same type (both strings or both numbers), got ${typeof bv.from} and ${typeof bv.to}`
        );
      }
      return { ...base, operator: 'between', value: f.value as never };
    }
    case 'in_last_n_days':
    case 'in_next_n_days': {
      // Only a number or a numeric string counts — Number() alone would coerce
      // true→1 and [7]→7, silently running a query the caller didn't ask for.
      const raw = f.value;
      const n =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'string' && raw.trim() !== ''
            ? Number(raw)
            : NaN;
      if (!Number.isInteger(n) || n <= 0 || n > RELATIVE_DATE_MAX_N) {
        throw new InvalidFilterValueError(
          `'${f.operator}' value must be a positive integer up to ${RELATIVE_DATE_MAX_N}, got: ${JSON.stringify(f.value)}`
        );
      }
      return {
        ...base,
        operator: 'relative_date',
        value: { kind: f.operator === 'in_last_n_days' ? 'last_n_days' : 'next_n_days', n },
      };
    }
    case 'this_week':
      return { ...base, operator: 'relative_date', value: { kind: 'this_week' } };
    case 'last_week':
      return { ...base, operator: 'relative_date', value: { kind: 'last_week' } };
    case 'this_month':
      return { ...base, operator: 'relative_date', value: { kind: 'this_month' } };
    case 'this_quarter':
      return { ...base, operator: 'relative_date', value: { kind: 'this_quarter' } };
    case 'last_quarter':
      return { ...base, operator: 'relative_date', value: { kind: 'last_quarter' } };
    case 'this_year':
      return { ...base, operator: 'relative_date', value: { kind: 'this_year' } };
    default:
      // Unreachable for the current enum (kept for future not-yet-mapped additions).
      throw new UnsupportedOperatorError(f.operator);
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
