import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
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
import { toStructuredToolError } from '../mappers/mcp-error.mapper';

@Injectable()
export class QueryDataMartTool implements McpToolDefinition<QueryDataMartInput> {
  readonly name = 'query_data_mart';
  readonly description = `Query an OWOX data mart and return its data rows in a compact, header-once table, plus server-side totals computed over all matching rows (ignoring the row limit). Each call costs credits.

Call get_data_mart_details_by_id first to get the data mart's exact field names, joinable/blended fields, and sample values, then copy field names verbatim into fields — unless you already have that schema in context. Field names must be exact; never guess or invent them.

When building the query:
- Request only the fields relevant to the user's question — never request all fields.
- Use limit to control how many rows come back (1–1000, default 20). There is no offset/pagination: the tool returns a bounded subset.
- aggregations: SUM, COUNT, COUNT_DISTINCT, AVG, MIN, MAX, and percentiles P25/P50/P75/P95 — but each data mart's output controls decide which functions a given field allows, so some may be rejected (pick another, or ask an admin to enable it). Group-by is implied by the non-aggregated fields you select.
- date_buckets: bucket a date/timestamp field by DAY/WEEK/MONTH/QUARTER/YEAR (e.g. "revenue by month").
- fields must list every column the query uses, INCLUDING any field named in aggregations or date_buckets — a field you aggregate or bucket but omit from fields is rejected. Example — "revenue by month": fields ["ts", "revenue"], aggregations [{field: "revenue", function: "SUM"}], date_buckets [{field: "ts", unit: "MONTH"}]. (Filters are the exception: a filter may reference a field that is not in fields.)

Choosing between slices and filters (both are row-level predicates applied to raw values BEFORE any aggregation — neither can threshold an aggregated total; there is no HAVING):
- slices (pre-join): narrow a JOINED data mart before it is blended in — criteria on a joined data mart's own fields only. Slices do NOT apply to the main data mart. More efficient — they reduce the joined volume before the join.
- filters (post-join): row-level criteria on the blended result — use for anything on the MAIN data mart's fields or on a joined field. A filter on a field you also aggregate restricts which raw rows feed the aggregate (e.g. filter revenue > 0 → SUM over positive rows), NOT the group total.
- Rule: pre-narrowing a joined data mart's rows → slices; any other raw-row criterion → filters.
- Filtering by an aggregated total (e.g. "groups whose SUM(revenue) > 100") is NOT supported — return all groups with their totals and let the caller compare.
- Example — "orders in the last 3 months" where orders is a joined data mart: the date range narrows the joined orders before the join → slices.

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

  // The MCP SDK validates arguments against `zodSchema` (the schema shape, non-strict) BEFORE
  // calling handler(): it strips unknown keys and rejects bad enums/missing fields with its own
  // generic error. So through a real MCP client this re-parse rarely fires — `.strict()`,
  // `invalid_input`, and the unsupported_aggregation/unsupported_date_bucket branches in mapError
  // are effectively defense-in-depth for direct/facade callers (only `unsupported_operator` is
  // reachable via a client, since those operators are intentionally in the enum).
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

    // Source-access / exclusion violations. Their message embeds the caller's name/email AND the
    // restricted data-mart titles (which discovery deliberately hides) — never forward that to the
    // AI provider. Return a generic denial with no titles or identity.
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
      const body = err.getResponse() as Record<string, unknown> | undefined;
      const errors = (body?.['details'] as Record<string, unknown> | undefined)?.['errors'] as
        | Array<{ code?: string; column?: string; function?: string }>
        | undefined;

      // A genuinely unknown column (hallucinated / disconnected) — the field name is wrong.
      if (errors?.some(e => e.code === 'FILTER_COLUMN_UNKNOWN')) {
        return toStructuredToolError(
          'field_not_found',
          `${err.message}. Call get_data_mart_details_by_id to get this data mart's exact field names (including joined/blended fields) and use them verbatim; never guess or invent field names.`
        );
      }

      // The column exists but was left out of `fields`. This is structural — the field name is
      // correct, so the field_not_found "re-check the schema" guidance would send the model in
      // circles. Point it at the real fix: add the referenced field to `fields`.
      const notSelected = new Set([
        'AGGREGATION_COLUMN_NOT_SELECTED',
        'DATE_TRUNC_COLUMN_NOT_SELECTED',
        'SORT_COLUMN_NOT_SELECTED',
      ]);
      const missing = errors?.filter(e => notSelected.has(e.code ?? '')) ?? [];
      if (missing.length > 0) {
        const cols = [...new Set(missing.map(e => e.column).filter(Boolean))].join(', ');
        return toStructuredToolError(
          'field_not_selected',
          `Field(s) referenced by aggregations, date_buckets, or sort but missing from "fields"${cols ? `: ${cols}` : ''}. Every aggregated, bucketed, or sorted field must also be listed in "fields". Add ${cols || 'them'} to "fields" and retry — the field name(s) are correct, so do not re-fetch the schema.`
        );
      }

      // The field exists and is selected, but the data mart's output controls don't permit this
      // aggregate function on it (admin-restricted / type-incompatible), or the (column, function)
      // pair is duplicated. Name field+function so the model can pick an allowed aggregation
      // instead of getting the bare "Output controls validation failed" string it can't act on.
      const aggNotAllowed = new Set([
        'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD',
        'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE',
        'DUPLICATE_AGGREGATION',
      ]);
      const rejected = errors?.filter(e => aggNotAllowed.has(e.code ?? '')) ?? [];
      if (rejected.length > 0) {
        const detail = [
          ...new Set(
            rejected.map(e => (e.function && e.column ? `${e.function}(${e.column})` : e.column))
          ),
        ]
          .filter(Boolean)
          .join(', ');
        return toStructuredToolError(
          'aggregation_not_allowed',
          `Aggregation not permitted on the requested field(s)${detail ? `: ${detail}` : ''}. This data mart's output controls restrict which aggregate functions each field allows (or the same field+function was requested twice). Choose a different aggregation, or ask an admin to enable it — the field name(s) are correct, so do not re-fetch the schema.`
        );
      }
    }

    // Unclassified error (raw DWH/driver text, unexpected exception). Do NOT forward err.message to
    // the AI provider — it can carry SQL fragments, identifiers, or PII. The full error is still
    // recorded in Run History for operators.
    return toStructuredToolError(
      'query_failed',
      'The query could not be completed. Verify the field names, filters, and aggregations against get_data_mart_details_by_id, then retry.'
    );
  }
}
