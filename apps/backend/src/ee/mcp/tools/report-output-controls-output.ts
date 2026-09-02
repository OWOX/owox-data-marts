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
    operator: z
      .string()
      .describe(
        'query_data_mart operator vocabulary where expressible; a rule created in the OWOX UI with a preset MCP cannot express (e.g. today, regex) is returned as stored — keep such a rule by omitting the control, not by re-sending it.'
      ),
    value: z.unknown().optional(),
  });

export const reportOutputControlsOutputShape = {
  fields: z
    .array(z.string())
    .describe("Column names the report exports, or ['*'] when it exports every field."),
  filters: z
    .array(filterOutputSchema())
    .describe('Row filters applied on every run, in add_report/update_report vocabulary.'),
  slices: z
    .array(filterOutputSchema())
    .describe('Pre-join filters of a blended report; empty for non-blended reports.'),
  post_aggregation_filters: z
    .array(filterOutputSchema().extend({ function: z.string() }))
    .optional()
    .describe(
      'Present only when the report has post-aggregation (HAVING) rules created in the OWOX UI. They cannot be set over MCP, and update_report "filters" replaces them.'
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
