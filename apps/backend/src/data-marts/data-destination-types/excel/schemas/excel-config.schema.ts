import { z } from 'zod';

/**
 * Type identifier for Excel report configuration
 */
export const ExcelConfigType = 'excel-config';

/**
 * Schema for validating Excel report configuration.
 *
 * Deliberately carries no location. A Google Sheets report names the spreadsheet and sheet it
 * writes into, because the server does the writing. Excel is pulled: the workbook asks for the
 * data, so it already knows where the rows go, and it is the only party that can know — a
 * workbook can be copied, renamed, or kept off any cloud, and has no server-addressable id.
 *
 * The sheet a report belongs to is therefore stored in the workbook itself, as a worksheet
 * custom property. Recording a guess here would create a second answer that immediately drifts
 * from the first.
 */
export const ExcelConfigSchema = z.object({
  /**
   * Configuration type identifier
   */
  type: z.literal(ExcelConfigType),
});

/**
 * Type definition for Excel report configuration
 */
export type ExcelConfig = z.infer<typeof ExcelConfigSchema>;
