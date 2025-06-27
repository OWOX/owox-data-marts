import type { GoogleSheetsReport } from '../types';
import type { GoogleSheetsService } from './google-sheets-api.interface';

/**
 * Stub implementation for real Google Sheets API integration
 * Replace methods with real API calls when backend is ready
 */
export const googleSheetsServiceApi: GoogleSheetsService = {
  /**
   * Get all Google Sheets reports (not implemented)
   */
  async getGoogleSheets(): Promise<GoogleSheetsReport[]> {
    await Promise.resolve();
    throw new Error('Not implemented');
  },
  /**
   * Create a new Google Sheets report (not implemented)
   * @param data - partial report data (must include title, dataMartId, dataDestinationId, destinationConfig)
   */
  async createGoogleSheet(): Promise<GoogleSheetsReport> {
    await Promise.resolve();
    throw new Error('Not implemented');
  },
  /**
   * Update a Google Sheets report (not implemented)
   */
  async updateGoogleSheet(): Promise<GoogleSheetsReport> {
    await Promise.resolve();
    throw new Error('Not implemented');
  },
  /**
   * Delete a Google Sheets report (not implemented)
   */
  async deleteGoogleSheet(): Promise<void> {
    await Promise.resolve();
    throw new Error('Not implemented');
  },
};
