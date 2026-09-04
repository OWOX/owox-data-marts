import type { AggregationConfig } from '../dto/schemas/aggregation-config.schema';
import type { DateTruncConfig } from '../dto/schemas/date-trunc-config.schema';
import type { FilterConfig, FilterRule } from '../dto/schemas/filter-config.schema';
import type { ReportColumnConfig } from '../dto/schemas/report-column-config.schema';
import type { SortConfig } from '../dto/schemas/sort-config.schema';
import type { UniqueCountConfig } from '../dto/schemas/unique-count-config.schema';
import {
  MAIN_UNIQUE_COUNT_SOURCE,
  UNIQUE_COUNT_FIELD_TOKEN,
  normalizeUniqueCountSources,
} from '../dto/schemas/unique-count-sources';
import { buildJoinedUniqueCountColumnName } from '../services/blended-field-name';

/**
 * One stored filter rule, spelled in the vocabulary the report tools ACCEPT
 * (`filters` / `slices` of add_report, update_report and query_data_mart), so an
 * agent can copy it back verbatim. `operator` is a plain string rather than the
 * MCP enum: a rule created in the OWOX UI may use a preset the MCP vocabulary
 * cannot express (`today`, `regex`, …) — such a rule is returned as stored, and
 * the agent must keep it by omitting the control rather than re-sending it.
 */
export interface McpReportFilter {
  field: string;
  operator: string;
  value?: unknown;
}

/**
 * A stored rule that filters an AGGREGATED value after grouping (`HAVING`). It can
 * only be created in the OWOX UI, and the report tools cannot express it — it is
 * exposed so the agent knows that replacing `filters` wipes it (see update_report).
 */
export interface McpReportHavingFilter extends McpReportFilter {
  function: string;
}

export interface McpReportAggregation {
  field: string;
  function: string;
}

export interface McpReportDateBucket {
  field: string;
  unit: string;
  time_zone?: string;
}

export interface McpReportSort {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * What a report exports, in the input vocabulary of add_report / update_report so
 * the agent can compare a stored report with a request (same fields, same
 * filters?) and send an update that preserves what it does not mean to change.
 */
export interface McpReportOutputControls {
  /**
   * Column names the report projects; `['*']` when it exports every field.
   * `[]` is a real selection, not "all": a metrics-only report projects no
   * dimension column and carries only its Unique Count metric(s).
   */
  fields: string[];
  /**
   * Unique Count metrics the report carries, under the names the agent already
   * knows: `unique_count` for the report's own data mart, and the same
   * `<source>__unique_count` names get_data_mart_details_by_id lists for joined
   * sources. Set only in the OWOX UI; update_report preserves it.
   */
  unique_count_sources: string[];
  /** Post-join (row) filter rules. Empty when the report exports all rows. */
  filters: McpReportFilter[];
  /** Pre-join (slice) rules of a blended report. Empty for non-blended reports. */
  slices: McpReportFilter[];
  /** UI-only post-aggregation rules; present only when the report has some. */
  post_aggregation_filters?: McpReportHavingFilter[];
  aggregations: McpReportAggregation[];
  date_buckets: McpReportDateBucket[];
  sort: McpReportSort[];
  /** Max rows per run, or `null` when uncapped. */
  limit: number | null;
}

/** The domain "all fields" marker, as add_report/update_report spell it. */
export const MCP_ALL_FIELDS = ['*'] as const;

/**
 * `null` (no projection) is "every field"; an ARRAY is the projection as stored —
 * including `[]`, the explicit "no dimension columns" of a metrics-only Unique
 * Count report, which must not read as "all fields".
 */
export function toMcpFields(columnConfig: ReportColumnConfig | undefined): string[] {
  return columnConfig ? [...columnConfig] : [...MCP_ALL_FIELDS];
}

export function toMcpUniqueCountSources(config: UniqueCountConfig | undefined): string[] {
  return normalizeUniqueCountSources(config).map(source =>
    source === MAIN_UNIQUE_COUNT_SOURCE
      ? UNIQUE_COUNT_FIELD_TOKEN
      : buildJoinedUniqueCountColumnName(source)
  );
}

/**
 * True when two column selections project the same set of fields — order does not
 * change what a report exports, and `null` / `['*']` both mean every field.
 */
export function sameFieldSelection(
  a: ReportColumnConfig | undefined,
  b: ReportColumnConfig
): boolean {
  const left = new Set(toMcpFields(a));
  const right = new Set(toMcpFields(b));
  // Set sizes, not array lengths: a repeated name is still one field.
  if (left.size !== right.size) return false;
  for (const field of left) {
    if (!right.has(field)) return false;
  }
  return true;
}

/**
 * Reverse of the MCP → domain mapper in `ee/mcp/tools/query-data-mart.input.ts`.
 * Operators that the mapper translates on the way in are translated back here
 * (`is_true` ↔ `eq true`, `relative_date last_n_days` ↔ `in_last_n_days`), so a
 * rule created over MCP round-trips to exactly what the agent sent. Anything the
 * MCP vocabulary cannot express stays as stored (see {@link McpReportFilter}).
 */
export function toMcpFilter(rule: FilterRule): McpReportFilter {
  const field = rule.column;
  switch (rule.operator) {
    case 'is_true':
      return { field, operator: 'eq', value: true };
    case 'is_false':
      return { field, operator: 'eq', value: false };
    case 'relative_date': {
      const preset = rule.value;
      switch (preset.kind) {
        case 'last_n_days':
          return { field, operator: 'in_last_n_days', value: preset.n };
        case 'next_n_days':
          return { field, operator: 'in_next_n_days', value: preset.n };
        case 'this_week':
        case 'last_week':
        case 'this_month':
        case 'this_quarter':
        case 'last_quarter':
        case 'this_year':
          return { field, operator: preset.kind };
        default:
          // today / yesterday / last_month / last_n_months: UI-only presets.
          return { field, operator: 'relative_date', value: preset };
      }
    }
    default:
      return 'value' in rule
        ? { field, operator: rule.operator, value: rule.value }
        : { field, operator: rule.operator };
  }
}

/**
 * Splits stored rules the way the tools take them: pre-join rules are `slices`,
 * post-join rules are `filters` (a rule without a placement — e.g. created in the
 * UI — counts as post-join, matching how the query engine applies it), and rules
 * with an aggregate `function` are the UI-only HAVING constraints.
 */
export function toMcpFilterGroups(filterConfig: FilterConfig | undefined): {
  filters: McpReportFilter[];
  slices: McpReportFilter[];
  post_aggregation_filters?: McpReportHavingFilter[];
} {
  const filters: McpReportFilter[] = [];
  const slices: McpReportFilter[] = [];
  const having: McpReportHavingFilter[] = [];
  for (const rule of filterConfig ?? []) {
    if (rule.function) {
      having.push({ ...toMcpFilter(rule), function: rule.function });
    } else if (rule.placement === 'pre-join') {
      slices.push(toMcpFilter(rule));
    } else {
      filters.push(toMcpFilter(rule));
    }
  }
  return {
    filters,
    slices,
    ...(having.length > 0 && { post_aggregation_filters: having }),
  };
}

export function toMcpAggregations(config: AggregationConfig | undefined): McpReportAggregation[] {
  return (config ?? []).map(rule => ({ field: rule.column, function: rule.function }));
}

export function toMcpDateBuckets(config: DateTruncConfig | undefined): McpReportDateBucket[] {
  return (config ?? []).map(rule => ({
    field: rule.column,
    unit: rule.unit,
    ...(rule.timeZone !== undefined && { time_zone: rule.timeZone }),
  }));
}

export function toMcpSort(config: SortConfig | undefined): McpReportSort[] {
  return (config ?? []).map(rule => ({ field: rule.column, direction: rule.direction }));
}

export function toMcpOutputControls(report: {
  columnConfig?: ReportColumnConfig;
  filterConfig?: FilterConfig | null;
  aggregationConfig?: AggregationConfig | null;
  dateTruncConfig?: DateTruncConfig | null;
  sortConfig?: SortConfig | null;
  limitConfig?: number | null;
  uniqueCountConfig?: UniqueCountConfig;
}): McpReportOutputControls {
  return {
    fields: toMcpFields(report.columnConfig),
    unique_count_sources: toMcpUniqueCountSources(report.uniqueCountConfig),
    ...toMcpFilterGroups(report.filterConfig),
    aggregations: toMcpAggregations(report.aggregationConfig),
    date_buckets: toMcpDateBuckets(report.dateTruncConfig),
    sort: toMcpSort(report.sortConfig),
    limit: report.limitConfig ?? null,
  };
}
