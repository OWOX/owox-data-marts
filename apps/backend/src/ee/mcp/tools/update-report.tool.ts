import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_REPORTS_FACADE,
  type McpReportsFacade,
} from '../../../data-marts/facades/mcp-reports.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import {
  makeMcpAggregationSchema,
  makeMcpDateBucketSchema,
  makeMcpFilterSchema,
  makeMcpSortSchema,
} from './query-data-mart.input';
import {
  mapReportAggregations,
  mapReportDateBuckets,
  mapReportFilters,
  mapReportSort,
} from './report-output-controls-input';
import { rethrowTranslatedOutputControlsError } from './output-controls-error.mapper';

// The raw shape (exposed to MCP clients) has every change field optional; the
// parsed schema additionally requires at least one of them, since an update
// with nothing to change is a caller mistake worth surfacing.
const baseInputSchema = z
  .object({
    report_id: z.string().min(1),
    fields: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe(
        "Replacement column selection, e.g. ['field_name_1', 'field_name_2'], or ['*'] for every field; omit to keep current. At least one change parameter is required."
      ),
    filters: z
      .array(makeMcpFilterSchema())
      .optional()
      .describe(
        'Replacement row filters applied on every report run — same shape and operator vocabulary as query_data_mart\'s "filters". Replaces only the current row filters (stored slices are untouched); pass [] to remove every row filter; omit to keep current.'
      ),
    slices: z
      .array(makeMcpFilterSchema())
      .optional()
      .describe(
        'Replacement pre-join filters (blended data marts only), same as query_data_mart\'s "slices". Replaces only the current slices (stored row filters are untouched); pass [] to remove every slice; omit to keep current.'
      ),
    aggregations: z
      .array(makeMcpAggregationSchema())
      .optional()
      .describe(
        'Replacement aggregations, same as query_data_mart\'s "aggregations". Each aggregated field must also appear in the report\'s column selection. Replaces ALL current aggregations; pass [] to remove them; omit to keep current.'
      ),
    date_buckets: z
      .array(makeMcpDateBucketSchema())
      .optional()
      .describe(
        'Replacement date buckets (DAY/WEEK/MONTH/QUARTER/YEAR), same as query_data_mart\'s "date_buckets". Replaces ALL current buckets; pass [] to remove them; omit to keep current.'
      ),
    sort: z
      .array(makeMcpSortSchema())
      .optional()
      .describe(
        'Replacement sort order, same as query_data_mart\'s "sort". Replaces the current order; pass [] to remove it; omit to keep current.'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .nullable()
      .optional()
      .describe('New max rows per report run; pass null to remove the cap; omit to keep current.'),
    name: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'New report name; omit to keep current. At least one change parameter is required.'
      ),
    message: z
      .object({
        subject: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('New message subject or heading; omit to keep the current one.'),
        body: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'New message body template; supports the {{table}} placeholder. Replaces the current body — and switches the report to a custom message if it used an insight template. Omit to keep the current one.'
          ),
      })
      .strict()
      .optional()
      .describe(
        'Message changes. Applies only to reports with an email, slack, teams, or google_chat destination; rejected for other types. Provide at least one of subject/body inside. The send condition and recipients are not editable here.'
      ),
  })
  .strict();

const inputSchema = baseInputSchema
  .refine(
    input =>
      input.fields !== undefined ||
      input.filters !== undefined ||
      input.slices !== undefined ||
      input.aggregations !== undefined ||
      input.date_buckets !== undefined ||
      input.sort !== undefined ||
      input.limit !== undefined ||
      input.name !== undefined ||
      input.message !== undefined,
    {
      message:
        'Provide at least one of fields, filters, slices, aggregations, date_buckets, sort, limit, name, or message to update',
    }
  )
  .refine(
    input =>
      input.message === undefined ||
      input.message.subject !== undefined ||
      input.message.body !== undefined,
    {
      message: 'Provide at least one of message.subject or message.body',
      path: ['message'],
    }
  );

type UpdateReportInput = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateReportTool implements McpToolDefinition<UpdateReportInput> {
  readonly name = 'update_report';
  readonly description =
    'Update an existing report: rename it, replace which data mart fields it exports, replace its output controls — filters/slices, aggregations, date_buckets, sort, limit — using the same vocabulary as query_data_mart ([] removes a control, null removes the limit), and/or — for reports with an email, slack, teams, or google_chat destination — change the message subject or body. Provide at least one change; anything not provided stays unchanged.';
  readonly zodSchema = baseInputSchema.shape;
  readonly outputSchema = {
    report_id: z.string().describe('Id of the updated report'),
    status: z.literal('updated').describe("Always 'updated' on success"),
  };
  readonly annotations = {
    title: 'Update Report',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_REPORTS_FACADE)
    private readonly reports: McpReportsFacade
  ) {}

  parseInput(input: unknown): UpdateReportInput {
    return inputSchema.parse(input);
  }

  async handler(input: UpdateReportInput, context: McpAuthContext): Promise<McpToolResult> {
    const {
      report_id,
      fields,
      filters,
      slices,
      aggregations,
      date_buckets,
      sort,
      limit,
      name,
      message,
    } = this.parseInput(input);

    // filters and slices are mapped separately: each replaces only its own kind
    // of stored rule (post-join vs pre-join), so updating one never wipes the other.
    const request = {
      reportId: report_id,
      fields,
      postJoinFilters: filters !== undefined ? mapReportFilters(undefined, filters) : undefined,
      preJoinFilters: slices !== undefined ? mapReportFilters(slices, undefined) : undefined,
      aggregationConfig: mapReportAggregations(aggregations),
      dateTruncConfig: mapReportDateBuckets(date_buckets),
      sortConfig: mapReportSort(sort),
      limitConfig: limit,
      name,
      message,
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    };

    let result;
    try {
      result = await this.reports.updateReport(request);
    } catch (err) {
      rethrowTranslatedOutputControlsError(err);
    }

    return jsonToolResult({ report_id: result.report_id, status: result.status });
  }
}
