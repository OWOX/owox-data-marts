import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_DATA_MARTS_FACADE,
  type McpDataMartsFacade,
  QueryAbortedError,
  QueryTimeoutError,
} from '../../../data-marts/facades/mcp-data-marts.facade';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { ProjectBlockedReason } from '../../../data-marts/enums/project-blocked-reason.enum';
import { ClsContextService } from '../../../common/logger/cls-context.service';
import { MCP_TOOL_DIAGNOSTICS_KEY } from '../observability/mcp-tool-diagnostics';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import type { McpToolDefinition, McpToolResult } from './mcp-tool.definition';
import {
  queryDataMartInputSchema,
  type QueryDataMartInput,
  mapMcpFiltersToRules,
  mapMcpAggregations,
  mapMcpDateBuckets,
  mapMcpSort,
  UnsupportedOperatorError,
  InvalidFilterValueError,
  UnsupportedAggregationError,
  UnsupportedDateBucketError,
  unsupportedOperatorMessage,
  DEFAULT_LIMIT,
} from './query-data-mart.input';
import { serializeTsvWithByteCap, ROWS_PAYLOAD_BYTE_CAP } from './tabular-serializer';
import { translateOutputControlsError } from './output-controls-error.mapper';
import { toStructuredToolError } from '../mappers/mcp-error.mapper';
import { buildFieldTypeMatrixSection } from './field-type-matrix';

@Injectable()
export class QueryDataMartTool implements McpToolDefinition<QueryDataMartInput> {
  readonly name = 'query_data_mart';
  readonly description = `Query an OWOX data mart and return its data rows in a compact, header-once table, plus server-side totals computed over all matching rows (ignoring the row limit). Each call costs credits.

Call get_data_mart_details_by_id first to get the data mart's exact field names and joinable/blended fields, then copy field names verbatim into fields — unless you already have that schema in context. Field names must be exact; never guess or invent them.

When building the query:
- Request only the fields relevant to the user's question — never request all fields.
- Use limit to control how many rows come back (1–1000, default 20). There is no offset/pagination: the tool returns a bounded subset.
- aggregations: SUM, COUNT, COUNT_DISTINCT, AVG, MIN, MAX, and percentiles P25/P50/P75/P95 — which of them a given field allows depends on the field's type and the data mart's per-field settings (see the matrix below). Group-by is implied by the non-aggregated fields you select.
- date_buckets: bucket a date/timestamp field by DAY/WEEK/MONTH/QUARTER/YEAR (e.g. "revenue by month"). Only date-category fields can be bucketed; time_zone applies only to types with a time-of-day component (TIMESTAMP/DATETIME — not pure DATE).

Which operators and aggregations fit which field type (using each field's "type" from get_data_mart_details_by_id):
${buildFieldTypeMatrixSection()}
A data mart can narrow a field's aggregations further ("only where enabled on the field") — get_data_mart_details_by_id returns each field's effective allowedAggregations; trust that over this table. Note COUNT/COUNT_DISTINCT are NOT available on number fields — to count rows per group, rely on the automatic "Row Count" column instead.
- sort: order the result rows by { field, direction } with direction "asc" or "desc"; rules apply in order (the first is the primary key). Each sorted field must also be listed in fields.
- fields must list every column the query uses, INCLUDING any field named in aggregations, date_buckets, or sort — a field you aggregate, bucket, or sort but omit from fields is rejected. Example — "revenue by month": fields ["ts", "revenue"], aggregations [{field: "revenue", function: "SUM"}], date_buckets [{field: "ts", unit: "MONTH"}]. (Filters are the exception: a filter may reference a field that is not in fields.)

Choosing between slices and filters (both are row-level predicates applied to raw values BEFORE any aggregation — neither can threshold an aggregated total; there is no HAVING):
- slices (pre-join): narrow a JOINED data mart before it is blended in — criteria on a joined data mart's own fields only. Slices do NOT apply to the main data mart. More efficient — they reduce the joined volume before the join. A slice runs on the field's ORIGINAL value, so when get_data_mart_details lists a "sliceType" for the field, use operators valid for that pre-join type (not the field's blended-result "type").
- filters (post-join): row-level criteria on the blended result — use for anything on the MAIN data mart's fields or on a joined field. A filter on a field you also aggregate restricts which raw rows feed the aggregate (e.g. filter revenue > 0 → SUM over positive rows), NOT the group total.
- Rule: pre-narrowing a joined data mart's rows → slices; any other raw-row criterion → filters.
- Filtering by an aggregated total (e.g. "groups whose SUM(revenue) > 100") is NOT supported — return all groups with their totals and let the caller compare.
- Example — "orders in the last 3 months" where orders is a joined data mart: the date range narrows the joined orders before the join → slices.

Using the results:
- Use metrics and totals from the response directly — never recompute a value already present (totals are computed server-side over all matching rows, so they stay correct even when rows are truncated).
- The totals block is separate from the rows.
- When you use aggregations, the rows include an extra "Row Count" column — the number of underlying rows in each group. It is grouping metadata, not one of your requested fields; ignore it unless the user asked how many rows a group contains.

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
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];

  constructor(
    @Inject(MCP_DATA_MARTS_FACADE)
    private readonly dataMarts: McpDataMartsFacade,
    private readonly cls: ClsContextService
  ) {}

  // The SDK already validates against zodSchema before handler(); this strict re-parse guards
  // direct/facade callers that bypass it.
  private parseInput(input: unknown): QueryDataMartInput {
    return queryDataMartInputSchema.parse(input);
  }

  async handler(
    input: QueryDataMartInput,
    context: McpAuthContext,
    signal?: AbortSignal
  ): Promise<McpToolResult> {
    try {
      const parsed = this.parseInput(input);
      const filterConfig = mapMcpFiltersToRules(parsed.slices, parsed.filters);
      const aggregationConfig = mapMcpAggregations(parsed.aggregations);
      const dateTruncConfig = mapMcpDateBuckets(parsed.date_buckets);
      const sortConfig = mapMcpSort(parsed.sort);

      const res = await this.dataMarts.queryDataMart(
        {
          projectId: context.projectId,
          userId: context.userId,
          roles: context.roles,
          dataMartId: parsed.data_mart_id,
          fields: parsed.fields,
          filterConfig,
          aggregationConfig,
          dateTruncConfig,
          sortConfig,
          limit: parsed.limit ?? DEFAULT_LIMIT,
        },
        signal
      );

      if (res.executedSql) {
        try {
          this.cls.update(MCP_TOOL_DIAGNOSTICS_KEY, { executedSql: res.executedSql });
        } catch {
          // diagnostics are best-effort; must never affect the query result
        }
      }

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

    if (err instanceof QueryTimeoutError) {
      return toStructuredToolError(
        'query_timeout',
        'The query took too long and was stopped (it was not billed). Make it lighter: request fewer fields, add tighter filters/slices, aggregate instead of returning raw rows, or lower the limit — then retry.'
      );
    }

    // Rarely delivered (the client already disconnected); kept for direct callers.
    if (err instanceof QueryAbortedError) {
      return toStructuredToolError(
        'query_cancelled',
        'The query was cancelled before it finished (it was not billed).'
      );
    }

    if (err instanceof UnsupportedOperatorError) {
      return toStructuredToolError(
        'unsupported_operator',
        unsupportedOperatorMessage(err.operator)
      );
    }

    if (err instanceof InvalidFilterValueError) {
      return toStructuredToolError(
        'invalid_filter_value',
        `${err.message}. The operator is supported — fix the value shape and retry.`
      );
    }

    if (err instanceof UnsupportedAggregationError) {
      return toStructuredToolError('unsupported_aggregation', err.message);
    }

    if (err instanceof UnsupportedDateBucketError) {
      return toStructuredToolError('unsupported_date_bucket', err.message);
    }

    if (err instanceof NotFoundException) {
      // Static string — a deeper resolver's NotFoundException could embed an id/title we must not leak.
      return toStructuredToolError('permission_denied', 'Data mart not found or not accessible.');
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

    // Generic denial — the raw message leaks the caller's identity and hidden data-mart titles.
    if (
      err instanceof BusinessViolationException &&
      (err.errorDetails?.['deniedDataMartIds'] || err.errorDetails?.['excludedDataMartIds'])
    ) {
      return toStructuredToolError(
        'permission_denied',
        'This query references one or more data marts you do not have reporting access to. Remove the joined/blended field(s) you cannot access, or ask an admin to grant access.'
      );
    }

    if (err instanceof BadRequestException) {
      const translated = translateOutputControlsError(err);
      if (translated) {
        return toStructuredToolError(translated.code, translated.message);
      }
    }

    // Never forward the raw message — it can carry SQL/identifiers/PII. Full error stays in Run History.
    return toStructuredToolError(
      'query_failed',
      'The query could not be completed. Verify the field names, filters, and aggregations against get_data_mart_details_by_id, then retry.'
    );
  }
}
