import { BadRequestException } from '@nestjs/common';
import type { FilterConfig } from '../../../data-marts/dto/schemas/filter-config.schema';
import {
  mapMcpFiltersToRules,
  SUPPORTED_MCP_OPERATORS,
  UnsupportedOperatorError,
} from './query-data-mart.input';

type McpFilterInput = { field: string; operator: string; value?: unknown };

/**
 * Maps the MCP filter vocabulary (shared with query_data_mart) into the domain
 * FilterConfig for report tools. Reports have no join phase of their own, so
 * every rule is a post-join filter on the report's SELECT.
 *
 * `undefined` in → `undefined` out (caller keeps/omits filters); an empty array
 * maps to `null` (no filters), which the update path uses to clear them.
 * Mapping failures — an operator the internal engine does not support yet, or a
 * malformed operand — become BadRequestException so the MCP client gets the
 * caller-vocabulary message instead of an opaque server error.
 */
export function mapReportFilters(filters: McpFilterInput[] | undefined): FilterConfig | undefined {
  if (filters === undefined) return undefined;
  try {
    return mapMcpFiltersToRules([], filters);
  } catch (err) {
    if (err instanceof UnsupportedOperatorError) {
      throw new BadRequestException(
        `Filter operator '${err.operator}' is not supported yet. Supported operators: ` +
          `${SUPPORTED_MCP_OPERATORS.join(', ')}. To match one of several values, use multiple ` +
          `filters with 'eq' (there is no 'in'/'not_in').`
      );
    }
    if (err instanceof Error) {
      // Operand-shape errors from the mapper (e.g. a 'between' value without from/to)
      // are caller mistakes, not server faults.
      throw new BadRequestException(err.message);
    }
    throw err;
  }
}
