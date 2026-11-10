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
import { StorageCredentialUnavailableException } from '../../../data-marts/exceptions/storage-credential-unavailable.exception';
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
  readonly description = `Query an OWOX data mart. Returns rows in a compact table, plus server-side totals over all matching rows (not only the returned ones). Each call costs credits, records a run, and may replace an OWOX-managed technical view when the Data Mart has a SQL definition.

Call get_data_mart_details_by_id first, unless you already have that schema in context. Copy exact field names into fields; never guess them.

Using the results:
- Use metrics and totals from the response directly; never recompute a value already present.
- If truncated is true, warn the user that the rows are incomplete, then narrow the query or raise limit (up to 1000).
- Name the Data Mart the answer came from. Say which numbers OWOX calculated and which you calculated yourself.
- data_last_updated_at is when the source tables last changed, not the period the data covers: say "the source tables were last updated on X". null means unknown, not stale. coverage "partial" means the real time can only be more recent: say "at least as recent as X" and that the picture is incomplete. "unavailable" means nothing could be determined. Mention it when the question depends on recency or before the user acts on the result. Show timestamps in a readable form, in the user's time zone when known; never as raw ISO-8601.

Building the query:
- Request only the fields the question needs. Non-aggregated fields become group-by dimensions only when the query aggregates (aggregations, date_buckets, a Unique Count field, or a "metric" Calculated Field in fields or filters); otherwise rows can repeat.
- fields must list every field named in aggregations, date_buckets or sort; filters may reference other fields. Example, "revenue by month": fields ["ts", "revenue"], aggregations [{field: "revenue", function: "SUM"}], date_buckets [{field: "ts", unit: "MONTH"}].
- Prefer a metric the data mart already defines: when get_data_mart_details_by_id shows a field whose "calculated" level is "metric", that field IS the quantity, computed at the grain your query asks for. Do not rebuild it by aggregating its inputs and dividing them yourself; on such a field an empty allowedAggregations means "already computed", never "unusable".
- For "how many" questions, use COUNT or COUNT_DISTINCT instead of counting raw rows yourself. Keep only the dimensions the user asked for.
- Use only the operators that operators_by_category lists for a field's category (sliceCategory for slices), and only the functions in the field's allowedAggregations. COUNT and COUNT_DISTINCT are NOT available on number fields: apply COUNT to an always-filled non-number field, such as a string id (COUNT skips NULLs). Arrays are column-only: a field whose mode is REPEATED or whose type or sliceType is ARRAY may appear only in fields.
- To count unique records of a JOINED data mart, select that source's Unique Count field (with_joined_fields lists it when one is available). Copy its "name", e.g. "orders__unique_count", not its displayName. Use it only in fields and sort.
- date_buckets: only on date-category fields. time_zone applies only to types with a time of day (not DATE), and never to a Calculated Field.

Slices or filters (both apply BEFORE the aggregations you request):
- slices narrow the rows of a JOINED data mart before the join, on its own fields only. Example: "orders in the last 3 months" on a joined orders data mart → slices.
- filters act on the blended result: any field of the main data mart, or a joined field. A joined field there has one value per join key (by default the SUM of numbers, the latest date, or all text values joined into one string), so a filter on it does not see the joined rows. A filter on an aggregated field limits the rows that feed the aggregate, not the group total.
- You cannot filter by a total from aggregations (e.g. SUM(revenue) > 100): return all groups and compare them yourself. Exception: a Calculated Field with level "metric" filters on its aggregated value; list it in fields too.`;
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
    destructiveHint: true, // SQL Data Mart queries can replace a technical warehouse view
    idempotentHint: false, // each call is a new billable Run
    openWorldHint: true,
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

    if (err instanceof StorageCredentialUnavailableException) {
      // Says who can fix the Credential and never names it, so it is forwarded as is.
      return toStructuredToolError('storage_credential_unavailable', err.message);
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
      // A HIDDEN column is a dead end for an agent, not a typo: it is absent from the schema this
      // error tells the caller to re-fetch, so "look it up and copy it verbatim" sends a model
      // round the same loop forever — and `field_not_found` is exactly what the system
      // instructions answer with "call it again with detail_level=with_joined_fields". Its own
      // code, so that advice does not apply, and the name may have come from any clause: the
      // validator raises this for a filter, slice, sort, aggregation or date bucket too, not only
      // for `fields`.
      const hidden = (err.errorDetails['hiddenColumns'] as string[] | undefined) ?? [];
      const unknown = (err.errorDetails['unknownColumns'] as string[]).filter(
        column => !hidden.includes(column)
      );
      if (hidden.length > 0 && unknown.length === 0) {
        return toStructuredToolError(
          'field_hidden_from_reporting',
          `Field(s) ${hidden.join(', ')} exist in this data mart but are hidden from reporting, so they cannot be queried and will never appear in get_data_mart_details_by_id. Remove them from "fields" and from any filter, slice, sort, aggregation or date bucket that names them, then retry; only the data mart's analyst can show them again. Do not re-fetch the schema looking for them.`
        );
      }
      return toStructuredToolError(
        'field_not_found',
        `Unknown field(s) in this data mart: ${unknown.join(', ')}. Call get_data_mart_details_by_id to get this data mart's exact field names (including joined/blended fields) and copy them verbatim into "fields"; never guess or invent field names.${hidden.length > 0 ? ` Field(s) ${hidden.join(', ')} exist but are hidden from reporting: remove them from "fields" and from any filter, slice, sort, aggregation or date bucket that names them, and do not look for them in the schema.` : ''}`
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
