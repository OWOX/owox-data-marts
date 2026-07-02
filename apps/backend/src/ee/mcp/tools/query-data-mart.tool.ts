import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_DATA_MARTS_FACADE,
  type McpDataMartsFacade,
} from '../../../data-marts/facades/mcp-data-marts.facade';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { ProjectBlockedReason } from '../../../data-marts/enums/project-blocked-reason.enum';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import type { McpToolDefinition, McpToolResult } from './mcp-tool.definition';
import {
  queryDataMartInputSchema,
  type QueryDataMartInput,
  mapMcpFiltersToRules,
  mapMcpAggregations,
  mapMcpDateBuckets,
  UnsupportedOperatorError,
  UnsupportedAggregationError,
  UnsupportedDateBucketError,
  SUPPORTED_MCP_OPERATORS,
  DEFAULT_LIMIT,
} from './query-data-mart.input';
import { serializeTsvWithByteCap, ROWS_PAYLOAD_BYTE_CAP } from './tabular-serializer';
import { toToolError, toStructuredToolError } from '../mappers/mcp-error.mapper';

@Injectable()
export class QueryDataMartTool implements McpToolDefinition<QueryDataMartInput> {
  readonly name = 'query_data_mart';
  readonly description = `Query an OWOX data mart and return its data rows in a compact, header-once table, plus server-side totals computed over all matching rows (ignoring the row limit). Each call costs credits.

Call get_data_mart_details_by_id first to get the data mart's exact field names, joinable/blended fields, and sample values, then copy field names verbatim into fields — unless you already have that schema in context. Field names must be exact; never guess or invent them.

When building the query:
- Request only the fields relevant to the user's question — never request all fields.
- Use limit to control how many rows come back (1–1000, default 20). There is no offset/pagination: the tool returns a bounded subset.
- aggregations: SUM, COUNT, COUNT_DISTINCT, AVG, MIN, MAX, and percentiles P25/P50/P75/P95. Group-by is implied by the non-aggregated fields you select.
- date_buckets: bucket a date/timestamp field by DAY/WEEK/MONTH/QUARTER/YEAR (e.g. "revenue by month").

Choosing between slices and filters:
- slices (pre-join): narrow a JOINED data mart before it is blended in — criteria on a joined data mart's own fields only. Slices do NOT apply to the main data mart. More efficient — they reduce the joined volume before the join.
- filters (post-join): criteria on the blended result — use for anything on the MAIN data mart's fields, on a joined field, or on an aggregated value.
- Rule: pre-narrowing a joined data mart's rows → slices; anything on the main data mart or on joined/aggregated results → filters.
- Example — "orders over 100 in the last 3 months" where orders is a joined data mart: the date range narrows the joined orders before the join → slices; the >100 threshold on the aggregated total → filters.

Using the results:
- Use metrics and totals from the response directly — never recompute a value already present (totals are computed server-side over all matching rows, so they stay correct even when rows are truncated).
- The totals block is separate from the rows.

If truncated is true, not all matching rows were returned: narrow the query (fewer fields, tighter slices/filters) or raise limit (up to 1000).`;
  readonly zodSchema = queryDataMartInputSchema.shape;
  readonly outputSchema = {
    columns: z.array(z.string()),
    rows: z.string(),
    returned_rows: z.number(),
    truncated: z.boolean(),
    totals: z.record(z.string(), z.unknown()).nullable(),
  };
  readonly annotations = {
    title: 'Query Data Mart',
    readOnlyHint: false, // costs credits and records a billable Run — not a silent read; clients should confirm
    destructiveHint: false,
    idempotentHint: false, // each call is a new billable Run
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(MCP_DATA_MARTS_FACADE)
    private readonly dataMarts: McpDataMartsFacade
  ) {}

  private parseInput(input: unknown): QueryDataMartInput {
    return queryDataMartInputSchema.parse(input);
  }

  async handler(input: QueryDataMartInput, context: McpAuthContext): Promise<McpToolResult> {
    try {
      const parsed = this.parseInput(input);
      const filterConfig = mapMcpFiltersToRules(parsed.slices, parsed.filters);
      const aggregationConfig = mapMcpAggregations(parsed.aggregations);
      const dateTruncConfig = mapMcpDateBuckets(parsed.date_buckets);

      const res = await this.dataMarts.queryDataMart({
        projectId: context.projectId,
        userId: context.userId,
        roles: context.roles,
        dataMartId: parsed.data_mart_id,
        fields: parsed.fields,
        filterConfig,
        aggregationConfig,
        dateTruncConfig,
        limit: parsed.limit ?? DEFAULT_LIMIT,
      });

      const { tsv, rowCount, capped } = serializeTsvWithByteCap(
        res.columns,
        res.rows,
        ROWS_PAYLOAD_BYTE_CAP
      );
      const structuredContent = {
        columns: res.columns,
        rows: tsv,
        returned_rows: rowCount, // actual rows in the payload (post-cap)
        truncated: res.truncated || capped, // row-limit OR byte-cap truncation
        totals: res.totals,
      };

      return {
        structuredContent,
        content: [
          {
            type: 'text',
            text: JSON.stringify(structuredContent),
          },
        ],
      };
    } catch (err) {
      return this.mapError(err);
    }
  }

  private mapError(err: unknown): McpToolResult {
    if (err instanceof z.ZodError) {
      const detail = err.issues
        .map(i => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
        .join('; ');
      return toStructuredToolError('invalid_input', `Invalid query input — ${detail}`);
    }

    if (err instanceof UnsupportedOperatorError) {
      const supported = SUPPORTED_MCP_OPERATORS.join(', ');
      return toStructuredToolError(
        'unsupported_operator',
        `Filter operator '${err.operator}' is not supported yet. Supported operators: ${supported}. To match one of several values, use multiple filters with 'eq' (there is no 'in'/'not_in').`
      );
    }

    if (err instanceof UnsupportedAggregationError) {
      return toStructuredToolError('unsupported_aggregation', err.message);
    }

    if (err instanceof UnsupportedDateBucketError) {
      return toStructuredToolError('unsupported_date_bucket', err.message);
    }

    if (err instanceof NotFoundException) {
      return toStructuredToolError('permission_denied', err.message);
    }

    if (err instanceof ProjectOperationBlockedException) {
      // Credits-exhausted takes priority when multiple reasons are present.
      if (err.blockedReasons.includes(ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED)) {
        return toStructuredToolError(
          'insufficient_credits',
          'This OWOX Data Marts project has reached its credit limit. Upgrade your plan to get more credits.'
        );
      }
      if (err.blockedReasons.includes(ProjectBlockedReason.BI_PROJECT_NOT_ACTIVE)) {
        return toStructuredToolError(
          'project_inactive',
          'This OWOX Data Marts project is inactive. Activate the project to continue.'
        );
      }
    }

    if (err instanceof BusinessViolationException && err.errorDetails?.['unknownColumns']) {
      const cols = (err.errorDetails['unknownColumns'] as string[]).join(', ');
      return toStructuredToolError(
        'field_not_found',
        `Unknown field(s) in this data mart: ${cols}. Call get_data_mart_details_by_id to get this data mart's exact field names (including joined/blended fields) and copy them verbatim into "fields"; never guess or invent field names.`
      );
    }

    if (err instanceof BadRequestException) {
      const body = err.getResponse() as Record<string, unknown> | undefined;
      const errors = (body?.['details'] as Record<string, unknown> | undefined)?.['errors'] as
        | Array<{ code?: string }>
        | undefined;
      const fieldCodes = new Set([
        'FILTER_COLUMN_UNKNOWN',
        'AGGREGATION_COLUMN_NOT_SELECTED',
        'SORT_COLUMN_NOT_SELECTED',
      ]);
      if (errors?.some(e => fieldCodes.has(e.code ?? ''))) {
        return toStructuredToolError(
          'field_not_found',
          `${err.message}. Call get_data_mart_details_by_id to get this data mart's exact field names (including joined/blended fields) and copy them verbatim into "fields"; never guess or invent field names.`
        );
      }
    }

    return toToolError(err);
  }
}
