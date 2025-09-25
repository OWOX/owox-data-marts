import { z } from 'zod';

/**
 * Type identifier for Google Sheets configuration
 */
export const GoogleSheetsConfigType = 'google-sheets-config';

/**
 * Schema for validating Google Sheets configuration
 * Defines the structure and validation rules for Google Sheets destination configuration
 */
export const GoogleSheetsConfigSchema = z.object({
  /**
   * Configuration type identifier
   */
  type: z.literal(GoogleSheetsConfigType),

  /**
   * ID of the Google Spreadsheet
   * This is the unique identifier found in the spreadsheet URL
   */
  spreadsheetId: z.string().min(1, 'Correct Google Spreadsheet ID is required'),

  /**
   * ID of the specific sheet within the spreadsheet
   * Each sheet in a Google Spreadsheet has a unique numeric ID
   */
  sheetId: z.number().min(0, 'Correct Google Spreadsheet sheet ID is required'),
});

/**
 * Type definition for Google Sheets configuration
 * Represents the structure of a validated Google Sheets configuration object
 */
export type GoogleSheetsConfig = z.infer<typeof GoogleSheetsConfigSchema>;
