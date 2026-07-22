import { BadRequestException } from '@nestjs/common';
import type { AggregationConfig } from '../../../data-marts/dto/schemas/aggregation-config.schema';
import type { DateTruncConfig } from '../../../data-marts/dto/schemas/date-trunc-config.schema';
import type { FilterConfig } from '../../../data-marts/dto/schemas/filter-config.schema';
import type { SortConfig } from '../../../data-marts/dto/schemas/sort-config.schema';
import {
  mapMcpAggregations,
  mapMcpDateBuckets,
  mapMcpFiltersToRules,
  mapMcpSort,
  SUPPORTED_MCP_OPERATORS,
  UnsupportedOperatorError,
} from './query-data-mart.input';

type McpFilterInput = { field: string; operator: string; value?: unknown };
type McpAggregationInput = { field: string; function: string };
type McpDateBucketInput = { field: string; unit: string; time_zone?: string };
type McpSortInput = { field: string; direction: 'asc' | 'desc' };

/**
 * Maps the MCP output-control vocabulary (shared with query_data_mart) into the
 * domain config types for the report tools, so a report can export exactly what
 * a query showed. Every mapper keeps the same convention:
 *
 * - `undefined` in → `undefined` out — the caller did not touch this control
 *   (create: none; update: keep the current value).
 * - An empty array maps to `null` (control removed), which the update path uses
 *   to clear a control.
 * - Mapping failures — an operator/function/unit the internal engine does not
 *   support, or a malformed operand — become BadRequestException so the MCP
 *   client gets the caller-vocabulary message instead of an opaque server error.
 */
function wrapMappingError(err: unknown): never {
  if (err instanceof UnsupportedOperatorError) {
    throw new BadRequestException(
      `Filter operator '${err.operator}' is not supported yet. Supported operators: ` +
        `${SUPPORTED_MCP_OPERATORS.join(', ')}. To match one of several values, use multiple ` +
        `filters with 'eq' (there is no 'in'/'not_in').`
    );
  }
  if (err instanceof Error) {
    // Operand-shape and unsupported-function/unit errors from the mappers
    // (e.g. a 'between' value without from/to) are caller mistakes, not server faults.
    throw new BadRequestException(err.message);
  }
  throw err;
}

/**
 * `slices` (pre-join) and `filters` (post-join) form ONE domain FilterConfig, so
 * they replace it as a unit: providing either replaces every stored rule of both
 * placements. Slices only apply to blended data marts, mirroring query_data_mart.
 */
export function mapReportFilters(
  slices: McpFilterInput[] | undefined,
  filters: McpFilterInput[] | undefined
): FilterConfig | undefined {
  if (slices === undefined && filters === undefined) return undefined;
  try {
    return mapMcpFiltersToRules(slices ?? [], filters ?? []);
  } catch (err) {
    wrapMappingError(err);
  }
}

export function mapReportAggregations(
  aggregations: McpAggregationInput[] | undefined
): AggregationConfig | undefined {
  if (aggregations === undefined) return undefined;
  try {
    return mapMcpAggregations(aggregations);
  } catch (err) {
    wrapMappingError(err);
  }
}

export function mapReportDateBuckets(
  dateBuckets: McpDateBucketInput[] | undefined
): DateTruncConfig | undefined {
  if (dateBuckets === undefined) return undefined;
  try {
    return mapMcpDateBuckets(dateBuckets);
  } catch (err) {
    wrapMappingError(err);
  }
}

export function mapReportSort(sort: McpSortInput[] | undefined): SortConfig | undefined {
  if (sort === undefined) return undefined;
  return mapMcpSort(sort);
}
