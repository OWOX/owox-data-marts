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
import { PublicOriginService } from '../../../common/config/public-origin.service';
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
  hasUniqueCountFieldCandidate,
  collectRealFieldNames,
  splitUniqueCountFields,
  findUniqueCountClauseViolations,
  UnsupportedOperatorError,
  InvalidFilterValueError,
  UnsupportedAggregationError,
  UnsupportedDateBucketError,
  UnmatchedUniqueCountFieldError,
  UniqueCountFieldUnsupportedClauseError,
  UniqueCountSourceLimitError,
  unsupportedOperatorMessage,
  DEFAULT_LIMIT,
} from './query-data-mart.input';
import {
  formatTsvColumnLabels,
  serializeTsvWithByteCap,
  ROWS_PAYLOAD_BYTE_CAP,
} from './tabular-serializer';
import { translateOutputControlsError } from './output-controls-error.mapper';
import { toStructuredToolError } from '../mappers/mcp-error.mapper';
import { buildDataMartUiPath } from './data-mart-ui-path';
import { joinPublicOrigin } from './mcp-public-url.util';
import { buildFieldTypeMatrixSection } from './field-type-matrix';
import { unavailableSourceDataLastUpdated } from '../../../data-marts/dto/schemas/source-data-last-updated.schema';

// Constant on purpose: a warehouse message quotes SQL, table and column names.
const TOTALS_UNAVAILABLE_MESSAGE =
  'Totals could not be computed for this query. Do not substitute a total summed from the returned rows — they are only the returned page.';

// The instruction hands the model a ready-to-say business phrasing ("August 4, 2026 at 09:46 UTC")
// instead of the raw ISO-8601 value, which business users cannot read. The ISO value itself stays
// in the structured block. en-US month names: the tool contract is English.
function formatUtcTimestampForHumans(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  const datePart = parsed.toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timePart = parsed.toLocaleString('en-US', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${datePart} at ${timePart} UTC`;
}

@Injectable()
export class QueryDataMartTool implements McpToolDefinition<QueryDataMartInput> {
  readonly name = 'query_data_mart';
  readonly description = `Query an OWOX data mart and return its data rows in a compact, header-once table, plus server-side totals computed over all matching rows (ignoring the row limit). Each call costs credits.

Call get_data_mart_details_by_id first to get the data mart's exact field names and joinable/blended fields, then copy field names verbatim into fields — unless you already have that schema in context. Field names must be exact; never guess or invent them.

When building the query:
- Request only the fields relevant to the user's question — never request all fields.
- Use limit to control how many rows come back (1–1000, default 20). There is no offset/pagination: the tool returns a bounded subset.
- aggregations: SUM, COUNT, COUNT_DISTINCT, AVG, MIN, MAX, and percentiles P25/P50/P75/P95 — which of them a given field allows depends on the field's type and the data mart's per-field settings (see the matrix below). Group-by is implied by the non-aggregated fields you select.
- For “how many” questions, use COUNT or COUNT_DISTINCT (when the business meaning is unique entities) instead of returning raw rows and counting them yourself. Keep only dimensions the user asked to break the count by.
- date_buckets: bucket a date/timestamp field by DAY/WEEK/MONTH/QUARTER/YEAR (e.g. "revenue by month"). Only date-category fields can be bucketed; time_zone applies only to types with a time-of-day component (TIMESTAMP/DATETIME — not pure DATE), and never to a Calculated Field, whose bucket must be requested without one.

Which operators and aggregations fit which field type (using each field's "type" from get_data_mart_details_by_id):
${buildFieldTypeMatrixSection()}
A data mart can narrow a field's aggregations further ("only where enabled on the field") — get_data_mart_details_by_id returns each field's effective allowedAggregations; trust that over this table. Note COUNT/COUNT_DISTINCT are NOT available on number fields — to count rows per group, apply COUNT to a non-number field you already select that is always filled (an id field works well; COUNT skips NULLs, so a nullable field undercounts). To count UNIQUE records of a JOINED data mart (e.g. "how many distinct orders per customer"), do not aggregate its id column — instead select that source's own Unique Count field like any other field; get_data_mart_details_by_id (with_joined_fields) lists it among that source's joined fields whenever one is available. Copy its "name" (e.g. "orders__unique_count"), never its human-readable "displayName". It can be selected in "fields" and ordered by in "sort" (using that same exact name), but it cannot be used in filters, slices, aggregations, or date_buckets.
- sort: order the result rows by { field, direction } with direction "asc" or "desc"; rules apply in order (the first is the primary key). Each sorted field must also be listed in fields.
- fields must list every column the query uses, INCLUDING any field named in aggregations, date_buckets, or sort — a field you aggregate, bucket, or sort but omit from fields is rejected. Example — "revenue by month": fields ["ts", "revenue"], aggregations [{field: "revenue", function: "SUM"}], date_buckets [{field: "ts", unit: "MONTH"}]. (Filters are the exception: a filter may reference a field that is not in fields.)

Choosing between slices and filters (both are row-level predicates applied to raw values BEFORE any aggregation, so neither can threshold a total you asked for via "aggregations" — the one exception is a Calculated Field whose level is "metric", whose formula is already aggregated and whose filter therefore compares the aggregated value):
- slices (pre-join): narrow a JOINED data mart before it is blended in — criteria on a joined data mart's own fields only. Slices do NOT apply to the main data mart. More efficient — they reduce the joined volume before the join. A slice runs on the field's ORIGINAL value, so when get_data_mart_details lists a "sliceType" for the field, use operators valid for that pre-join type (not the field's blended-result "type").
- filters (post-join): row-level criteria on the blended result — use for anything on the MAIN data mart's fields or on a joined field. A filter on a field you also aggregate restricts which raw rows feed the aggregate (e.g. filter revenue > 0 → SUM over positive rows), NOT the group total.
- Rule: pre-narrowing a joined data mart's rows → slices; any other raw-row criterion → filters.
- Filtering by a total you asked for via "aggregations" (e.g. "groups whose SUM(revenue) > 100") is NOT supported — return all groups with their totals and let the caller compare. If the data mart already defines that quantity as a Calculated Field with level "metric", filter on THAT field instead and the threshold is applied to the aggregated value; list it in "fields" when you do.
- Example — "orders in the last 3 months" where orders is a joined data mart: the date range narrows the joined orders before the join → slices.

Using the results:
- Use metrics and totals from the response directly — never recompute a value already present (totals are computed server-side over all matching rows, so they stay correct even when rows are truncated).
- The totals block is separate from the rows.
- Totals keys are technical output column names. Match a totals key to column_metadata[].name, not to a business-friendly columns label.
- data_last_updated answers "how current is what I am looking at?". Read it carefully before repeating it:
  - data_last_updated_at is when the SOURCE TABLES last changed in the data warehouse. It is NOT a statement about which time period the data covers: a table rewritten today may have only backfilled figures for 2021. Say "the source tables were last updated on X", never "the data is fresh as of X".
  - null means unknown, not old and not fresh. Say the warehouse does not report it, and do not infer staleness from it.
  - coverage "partial" means some sources could not be read, so the real time can only be MORE recent than the one reported — present it as "at least as recent as X" and mention that the picture is incomplete. "unavailable" means nothing could be determined.
  - Mention it unprompted when the user's question depends on recency (today's numbers, "latest", trends up to now) or when they are about to act on the result.
  - Present every timestamp from this block (including per-table sources) in a business-friendly form — e.g. "August 4, 2026 at 09:46 UTC" — converted to the user's time zone when the conversation establishes one, otherwise in UTC with the zone named. Never show a raw ISO-8601 value like 2026-08-04T09:46:33Z.

If truncated is true, not all matching rows were returned: narrow the query (fewer fields, tighter slices/filters) or raise limit (up to 1000). Always use the source metadata in the response: name the Data Mart the answer came from, distinguish numbers calculated by OWOX from arithmetic you perform yourself, and clearly warn the user when rows were truncated.`;
  readonly zodSchema = queryDataMartInputSchema.shape;
  readonly outputSchema = {
    columns: z.array(z.string()).describe('Business-friendly result headers, in rows order.'),
    column_metadata: z.array(
      z.object({
        name: z.string().describe('Exact output column name.'),
        display_name: z.string().describe('Business-friendly label for presentation.'),
        description: z.string().optional(),
        type: z.string().optional(),
      })
    ),
    rows: z.string(),
    returned_rows: z.number(),
    truncated: z.boolean(),
    truncation: z
      .object({
        reasons: z.array(z.enum(['row_limit', 'payload_byte_cap'])).min(1),
      })
      .optional(),
    totals: z
      .record(z.string(), z.unknown())
      .nullable()
      .describe(
        'Server-side totals keyed by technical output column name. Match each key to column_metadata[].name.'
      ),
    // Fresh object literals, never a shared schema instance: a reused instance serialises as a
    // JSON-Schema $ref, which some clients degrade to an untyped value.
    data_last_updated: z.object({
      data_last_updated_at: z
        .string()
        .nullable()
        .describe(
          'When the SOURCE TABLES last changed in the warehouse (ISO-8601 UTC), not a claim about which period the data covers. null = the warehouse does not report it; treat as unknown, never as stale or fresh.'
        ),
      computed_at: z
        .string()
        .describe('When this was measured. Computed live for this query; never cached.'),
      coverage: z
        .enum(['complete', 'partial', 'unavailable'])
        .describe(
          'complete = every source table resolved. partial = some could not be read, so the true time is at least as recent as reported. unavailable = nothing could be determined.'
        ),
      sources: z
        .array(
          z.object({
            table: z.string(),
            data_last_updated_at: z.string().nullable(),
            note: z.string().optional(),
          })
        )
        .describe('Per-table detail behind the value. Views are excluded deliberately.'),
    }),
    totals_error: z
      .string()
      .optional()
      .describe(
        'Present only when totals were requested but FAILED. Totals are null in that case for a reason, not because the report has none — do not substitute a total summed from the returned rows.'
      ),
    source: z.object({
      data_mart: z.object({
        id: z.string(),
        title: z.string(),
        url: z.string(),
      }),
    }),
    calculation_origin: z.object({
      rows: z.literal('taken_from_owox'),
      totals: z.enum(['calculated_by_owox', 'not_available', 'failed']),
      data_last_updated: z.enum(['measured_by_owox', 'not_available']),
    }),
    _instruction: z.string(),
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
    private readonly cls: ClsContextService,
    private readonly publicOriginService: PublicOriginService
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

      // Only a data mart that joins others carries a Unique Count pseudo-field, and most
      // requests select none — skip the extra schema lookup unless a field could be one.
      let fields = parsed.fields;
      let uniqueCountConfig: string[] | undefined;
      if (hasUniqueCountFieldCandidate(parsed.fields)) {
        const details = await this.dataMarts.getDataMartDetails({
          projectId: context.projectId,
          userId: context.userId,
          roles: context.roles,
          dataMartId: parsed.data_mart_id,
          includeJoinedFields: true,
        });
        const split = splitUniqueCountFields(
          parsed.fields,
          details.uniqueCountSources,
          collectRealFieldNames(details)
        );
        fields = split.columns;
        uniqueCountConfig = split.uniqueCountConfig;

        // A matched pseudo-field is no longer in `columns`, so if it is ALSO named in filters/
        // slices/aggregations/date_buckets, letting the request through would hit the validator's
        // "column not selected" family — whose fix-it message says to add the field back to
        // "fields", where the model already put it. Catch it here instead, before that
        // unresolvable loop can start. `sort` is not in that set: the metric IS orderable, and
        // its sortConfig entry is forwarded untouched.
        const violations = findUniqueCountClauseViolations(split.matchedNames, {
          filters: parsed.filters,
          slices: parsed.slices,
          aggregations: parsed.aggregations,
          date_buckets: parsed.date_buckets,
        });
        if (violations.length > 0) {
          throw new UniqueCountFieldUnsupportedClauseError(violations);
        }
      }

      const res = await this.dataMarts.queryDataMart(
        {
          projectId: context.projectId,
          userId: context.userId,
          roles: context.roles,
          dataMartId: parsed.data_mart_id,
          fields,
          filterConfig,
          aggregationConfig,
          dateTruncConfig,
          sortConfig,
          ...(uniqueCountConfig ? { uniqueCountConfig } : {}),
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

      const displayColumns = formatTsvColumnLabels(res.columnMetadata);
      const { tsv, headerColumns, rowCount, capped } = serializeTsvWithByteCap(
        displayColumns,
        res.rows,
        ROWS_PAYLOAD_BYTE_CAP
      );
      const truncationReasons = [
        ...(res.truncated ? (['row_limit'] as const) : []),
        ...(capped ? (['payload_byte_cap'] as const) : []),
      ];
      const isTruncated = truncationReasons.length > 0;
      const totalsKeyInstruction = res.totals
        ? ' Totals keys are technical output names; match them to column_metadata[].name, not to display labels.'
        : res.totalsError
          ? ' Totals could not be computed for this query (see totals_error). Say so; do NOT present a total summed from the returned rows as an OWOX total.'
          : '';
      // This block is auxiliary metadata: a query that produced rows must still answer even if it
      // is missing, so an absent block degrades to "unavailable" rather than failing the call.
      const dataLastUpdated = res.dataLastUpdated ?? unavailableSourceDataLastUpdated();
      // Repeated per response because the failure mode is specific and costly: relaying a source
      // modification time as if it were the recency of the data itself.
      const dataLastUpdatedInstruction = dataLastUpdated.dataLastUpdatedAt
        ? ` If you mention how current the data is, say the SOURCE TABLES were last updated on ${formatUtcTimestampForHumans(dataLastUpdated.dataLastUpdatedAt)} — converted to the user's time zone when the conversation establishes one, never as a raw ISO-8601 timestamp — and do not restate it as the data being fresh or complete up to then.${
            dataLastUpdated.coverage === 'partial'
              ? ' Coverage is partial, so treat that as "at least as recent as" and say the picture is incomplete.'
              : ''
          }`
        : ' The source last-updated time is unknown here; if asked how current the data is, say OWOX could not determine it rather than implying it is fresh or stale.';
      const structuredContent = {
        columns: headerColumns,
        column_metadata: res.columnMetadata.map((column, index) => ({
          name: column.name,
          display_name: headerColumns[index],
          ...(column.description ? { description: column.description } : {}),
          ...(column.type ? { type: column.type } : {}),
        })),
        rows: tsv,
        returned_rows: rowCount, // actual rows in the payload (post-cap)
        truncated: isTruncated,
        ...(isTruncated ? { truncation: { reasons: truncationReasons } } : {}),
        totals: res.totals,
        data_last_updated: {
          data_last_updated_at: dataLastUpdated.dataLastUpdatedAt,
          computed_at: dataLastUpdated.computedAt,
          coverage: dataLastUpdated.coverage,
          sources: dataLastUpdated.sources.map(source => ({
            table: source.table,
            data_last_updated_at: source.dataLastUpdatedAt,
            ...(source.note ? { note: source.note } : {}),
          })),
        },
        // The fact of the failure is what the caller acts on; the reason goes to the run metadata.
        ...(res.totalsError ? { totals_error: TOTALS_UNAVAILABLE_MESSAGE } : {}),
        source: {
          data_mart: {
            id: res.dataMart.id,
            title: res.dataMart.title,
            url: joinPublicOrigin(
              this.publicOriginService.getPublicOrigin(),
              buildDataMartUiPath(context.projectId, res.dataMart.id)
            ),
          },
        },
        calculation_origin: {
          rows: 'taken_from_owox' as const,
          totals: res.totals
            ? ('calculated_by_owox' as const)
            : res.totalsError
              ? ('failed' as const)
              : ('not_available' as const),
          data_last_updated: dataLastUpdated.dataLastUpdatedAt
            ? ('measured_by_owox' as const)
            : ('not_available' as const),
        },
        _instruction: isTruncated
          ? `IMPORTANT: Rows are incomplete. Tell the user explicitly that the result was truncated and that any conclusion based on rows may be incomplete. State the Data Mart source. Server-provided totals still cover all matching rows; do not describe a value you calculate from returned rows as an OWOX-calculated total.${totalsKeyInstruction}${dataLastUpdatedInstruction}`
          : `State which Data Mart supplied the data. Identify server-provided rows and totals as taken from or calculated by OWOX. If you perform arithmetic from those values yourself, label it as an AI-side calculation.${totalsKeyInstruction}${dataLastUpdatedInstruction}`,
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

    if (err instanceof UnmatchedUniqueCountFieldError) {
      return toStructuredToolError('field_not_found', err.message);
    }

    if (err instanceof UniqueCountFieldUnsupportedClauseError) {
      return toStructuredToolError('unique_count_selection_only', err.message);
    }

    if (err instanceof UniqueCountSourceLimitError) {
      return toStructuredToolError('invalid_input', err.message);
    }

    if (err instanceof BusinessViolationException && err.errorDetails?.['unknownColumns']) {
      const cols = (err.errorDetails['unknownColumns'] as string[]).join(', ');
      return toStructuredToolError(
        'field_not_found',
        `Unknown field(s) in this data mart: ${cols}. Call get_data_mart_details_by_id to get this data mart's exact field names (including joined/blended fields) and copy them verbatim into "fields"; never guess or invent field names.`
      );
    }

    if (err instanceof BusinessViolationException) {
      // A name the query engine reserves for its own aliases. The field exists and the query is
      // well-formed, so neither a schema re-fetch nor a query rewrite fixes it — only a rename
      // in the Data Mart does; without naming the field the caller cannot act at all.
      const reservedNameColumns = err.errorDetails?.['reservedNameColumns'] as string[] | undefined;
      if (reservedNameColumns?.length) {
        return toStructuredToolError(
          'field_name_reserved',
          `Field(s) ${reservedNameColumns.join(', ')} collide with a name reserved by the OWOX query engine, so they cannot be used as a selected or grouped column. Rename the field (or its output alias) in the Data Mart and retry; until that is done, the only way to get results is to drop these field(s) from "fields". The name(s) do exist in this data mart, so do not re-fetch the schema.`
        );
      }
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

    // A calculated-field refusal raised OUTSIDE the output-controls validator. These
    // hand-write their reason and name only fields of the caller's own Data Mart, so the message
    // is forwarded rather than reworded. Without this branch they fall to the generic
    // `query_failed` below, which names no field and tells the agent to check field names that are
    // correct — a loop it cannot escape, since re-fetching the schema keeps confirming them. Kept
    // BELOW the denial branch so that an exception ever carrying both keys is answered by the one
    // that leaks nothing.
    //
    // Three payload spellings, because three different producers reach here and the singular one
    // is by far the most common:
    //   `calculatedField`        — every renderer, sleeve and planner refusal (report-shape
    //                              dependent, so these fire on a schema that saved clean);
    //   `joinedCalculatedColumns`— `assertNoJoinedCalculatedColumns`, reachable with nothing more
    //                              than a projection and a limit;
    //   `calculatedFields`       — `composeMetricsOnly`'s no-userId guard.
    // Reading only the last of those made this branch dead at query time.
    if (err instanceof BusinessViolationException) {
      const details = err.errorDetails ?? {};
      const asList = (value: unknown): string[] =>
        typeof value === 'string'
          ? [value]
          : Array.isArray(value)
            ? value.filter((v): v is string => typeof v === 'string')
            : [];
      const named = [
        ...new Set([
          ...asList(details['calculatedField']),
          ...asList(details['joinedCalculatedColumns']),
          ...asList(details['calculatedFields']),
        ]),
      ];
      if (named.length) {
        return toStructuredToolError(
          'calculated_field_not_supported',
          `${err.message}. Drop ${named.join(', ')} from "fields" and retry to get the rest of the answer — the field name(s) are correct, so do not re-fetch the schema. Changing the formula itself takes a person editing the Data Mart in OWOX.`
        );
      }
    }

    if (err instanceof BadRequestException) {
      const translated = translateOutputControlsError(err);
      if (translated) {
        return toStructuredToolError(translated.code, translated.message);
      }
    }

    // Never forward the raw message — it can carry SQL/identifiers/PII.
    return toStructuredToolError(
      'query_failed',
      'The query could not be completed. Verify the field names, filters, and aggregations against get_data_mart_details_by_id, then retry.'
    );
  }
}
