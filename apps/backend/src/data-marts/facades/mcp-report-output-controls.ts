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
 * MCP enum because the same shape also carries a UI-only rule (see
 * {@link McpReportUiOnlyFilter}) as stored.
 */
export interface McpReportFilter {
  field: string;
  operator: string;
  value?: unknown;
}

/**
 * A stored rule the report tools cannot express — created in the OWOX UI: a
 * post-aggregation (`HAVING`) constraint (`function` set), a regex, or a calendar
 * preset such as "today". Listed so the agent knows what the report also
 * applies; update_report keeps these rules untouched (see mergeFilterConfig),
 * and they are changed or removed in the OWOX UI.
 */
export interface McpReportUiOnlyFilter extends McpReportFilter {
  placement: 'pre-join' | 'post-join';
  function?: string;
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
  /** Post-join (row) filter rules the tools can express. Empty when none. */
  filters: McpReportFilter[];
  /** Pre-join (slice) rules of a blended report the tools can express. */
  slices: McpReportFilter[];
  /** Rules the tools cannot express; present only when the report has some. */
  ui_only_filters?: McpReportUiOnlyFilter[];
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

/** Calendar presets the MCP vocabulary has no operator for. */
const UI_ONLY_RELATIVE_DATE_KINDS: ReadonlySet<string> = new Set([
  'today',
  'yesterday',
  'last_month',
  'last_n_months',
]);

/**
 * True for a stored rule that no report-tool call can re-send: a post-aggregation
 * (HAVING) constraint, a regex, or a calendar preset outside the MCP vocabulary.
 * Mirror of what {@link toMcpFilter} cannot translate — keep the two together.
 */
export function isUiOnlyFilterRule(rule: FilterRule): boolean {
  if (rule.function) return true;
  switch (rule.operator) {
    case 'regex':
    case 'not_regex':
      return true;
    case 'relative_date':
      return UI_ONLY_RELATIVE_DATE_KINDS.has(rule.value.kind);
    default:
      return false;
  }
}

/**
 * Splits stored rules the way the tools take them: expressible pre-join rules are
 * `slices`, expressible post-join rules are `filters` (a rule without a placement
 * — e.g. created in the UI — counts as post-join, matching how the query engine
 * applies it), and everything the tools cannot express is `ui_only_filters`, each
 * tagged with its placement so the agent can see the whole definition.
 */
export function toMcpFilterGroups(filterConfig: FilterConfig | undefined): {
  filters: McpReportFilter[];
  slices: McpReportFilter[];
  ui_only_filters?: McpReportUiOnlyFilter[];
} {
  const filters: McpReportFilter[] = [];
  const slices: McpReportFilter[] = [];
  const uiOnly: McpReportUiOnlyFilter[] = [];
  for (const rule of filterConfig ?? []) {
    const placement = rule.placement === 'pre-join' ? 'pre-join' : 'post-join';
    if (isUiOnlyFilterRule(rule)) {
      uiOnly.push({
        ...toMcpFilter(rule),
        placement,
        ...(rule.function !== undefined && { function: rule.function }),
      });
    } else if (placement === 'pre-join') {
      slices.push(toMcpFilter(rule));
    } else {
      filters.push(toMcpFilter(rule));
    }
  }
  return {
    filters,
    slices,
    ...(uiOnly.length > 0 && { ui_only_filters: uiOnly }),
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
