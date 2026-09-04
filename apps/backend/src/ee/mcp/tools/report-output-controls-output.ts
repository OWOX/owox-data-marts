import { z } from 'zod';

/**
 * Output-schema shape of a report's stored output controls, spelled in the input
 * vocabulary of add_report / update_report so the agent can compare a stored
 * report with a request and copy a control back verbatim. Shared by
 * get_data_mart_reports (each listed report), update_report (the resulting
 * report) and the similar_report_exists error of add_report.
 */
const filterOutputSchema = () =>
  z.object({
    field: z.string(),
    operator: z.string().describe('query_data_mart operator vocabulary.'),
    value: z.unknown().optional(),
  });

export const reportOutputControlsOutputShape = {
  fields: z
    .array(z.string())
    .describe(
      "Column names the report exports, or ['*'] when it exports every field. [] is a metrics-only report: no dimension column, only its Unique Count metric(s)."
    ),
  unique_count_sources: z
    .array(z.string())
    .describe(
      "Unique Count metrics the report carries: 'unique_count' for its own data mart, '<source>__unique_count' for joined sources (the names get_data_mart_details_by_id lists). Set only in the OWOX UI; update_report keeps them."
    ),
  filters: z
    .array(filterOutputSchema())
    .describe(
      'Row filters applied on every run that update_report "filters" can replace, in add_report/update_report vocabulary.'
    ),
  slices: z
    .array(filterOutputSchema())
    .describe(
      'Pre-join filters of a blended report that update_report "slices" can replace; empty for non-blended reports.'
    ),
  ui_only_filters: z
    .array(
      filterOutputSchema().extend({
        placement: z.enum(['pre-join', 'post-join']),
        function: z
          .string()
          .optional()
          .describe('Set for a post-aggregation (HAVING) rule: the aggregate it constrains.'),
      })
    )
    .optional()
    .describe(
      'Present only when the report also applies rules created in the OWOX UI that MCP cannot express (post-aggregation constraints, regex, calendar presets such as today or last month). update_report keeps them untouched whatever you send in filters/slices; they are changed or removed in the OWOX UI. Returned as stored — never re-send them.'
    ),
  aggregations: z.array(z.object({ field: z.string(), function: z.string() })),
  date_buckets: z.array(
    z.object({ field: z.string(), unit: z.string(), time_zone: z.string().optional() })
  ),
  sort: z.array(z.object({ field: z.string(), direction: z.enum(['asc', 'desc']) })),
  limit: z.number().nullable().describe('Max rows per run, or null when uncapped.'),
};

export const reportSheetInfoOutputShape = {
  spreadsheet_id: z
    .string()
    .optional()
    .describe(
      'Google Sheets only. Id of the spreadsheet the report writes to — pass it as spreadsheet_id to add_report to put a related export into the same document.'
    ),
  sheet_url: z.string().optional().describe("Google Sheets only. Link to the report's sheet."),
};
