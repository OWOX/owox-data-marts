import type { GoogleSheetsReport } from '../types';

/**
 * Service contract for Google Sheets reports CRUD operations
 */
export interface GoogleSheetsService {
  /**
   * Get all Google Sheets reports
   * @returns Promise with array of GoogleSheetsReport
   */
  getGoogleSheets(): Promise<GoogleSheetsReport[]>;
  /**
   * Create a new Google Sheets report
   * @param data - partial report data (must include title, dataMartId, dataDestinationId, destinationConfig)
   * @returns Promise with created GoogleSheetsReport
   */
  createGoogleSheet(data: Partial<GoogleSheetsReport>): Promise<GoogleSheetsReport>;
  /**
   * Update an existing Google Sheets report by id
   * @param id - report id
   * @param data - partial report data to update
   * @returns Promise with updated GoogleSheetsReport
   */
  updateGoogleSheet(id: string, data: Partial<GoogleSheetsReport>): Promise<GoogleSheetsReport>;
  /**
   * Delete a Google Sheets report by id
   * @param id - report id
   * @returns Promise<void>
   */
  deleteGoogleSheet(id: string): Promise<void>;
}
