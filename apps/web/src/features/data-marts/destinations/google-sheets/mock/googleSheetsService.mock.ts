import type { GoogleSheetsReport } from '../shared/types';
import { GoogleSheetsReportStatusEnum } from '../shared/types';
import type { GoogleSheetsService } from '../shared/api';

let mockData: GoogleSheetsReport[] = [
  {
    id: '1',
    title:
      'Sales Report Sales Report Sales Report Sales Report Sales Report Sales Report Sales Report',
    dataMartId: 'mart1',
    dataDestinationId: 'dest1',
    destinationConfig: {
      type: 'google-sheets-config',
      spreadsheetId: 'spreadsheet1',
      sheetId: 'sheet1',
    },
    lastRunDate: new Date('2025-05-16T05:00:00Z'),
    lastRunStatus: GoogleSheetsReportStatusEnum.SUCCESS,
  },
  {
    id: '2',
    title: 'Marketing Report',
    dataMartId: 'mart2',
    dataDestinationId: 'dest2',
    destinationConfig: {
      type: 'google-sheets-config',
      spreadsheetId: 'spreadsheet2',
      sheetId: 'sheet2',
    },
    lastRunDate: new Date('2025-05-15T05:00:00Z'),
    lastRunStatus: GoogleSheetsReportStatusEnum.FAIL,
    lastRunError: 'API quota exceeded',
  },
  {
    id: '3',
    title: 'Finance Report',
    dataMartId: 'mart3',
    dataDestinationId: 'dest3',
    destinationConfig: {
      type: 'google-sheets-config',
      spreadsheetId: 'spreadsheet3',
      sheetId: 'sheet3',
    },
    lastRunDate: new Date('2025-05-14T05:00:00Z'),
    lastRunStatus: GoogleSheetsReportStatusEnum.IN_PROGRESS,
  },
];

/**
 * Mock implementation of GoogleSheetsService for development and testing
 */
export const googleSheetsService: GoogleSheetsService = {
  /**
   * Get all Google Sheets reports (mock)
   * @returns Promise with array of GoogleSheetsReport
   */
  async getGoogleSheets(): Promise<GoogleSheetsReport[]> {
    await new Promise(res => setTimeout(res, 300));
    return mockData;
  },
  /**
   * Delete a Google Sheets report by id (mock)
   * @param id - report id
   * @throws Error if id not found
   */
  async deleteGoogleSheet(id: string): Promise<void> {
    const exists = mockData.some(item => item.id === id);
    if (!exists) {
      throw new Error('Not found');
    }
    mockData = mockData.filter(item => item.id !== id);
    await new Promise(res => setTimeout(res, 200));
  },
  /**
   * Create a new Google Sheets report (mock)
   * @param data - partial report data (must include title, dataMartId, dataDestinationId, destinationConfig)
   * @returns Promise with created GoogleSheetsReport
   * @throws Error if required fields are missing
   */
  async createGoogleSheet(data: Partial<GoogleSheetsReport>): Promise<GoogleSheetsReport> {
    if (!data.title || !data.dataMartId || !data.dataDestinationId || !data.destinationConfig) {
      throw new Error(
        'Missing required fields: title, dataMartId, dataDestinationId, destinationConfig'
      );
    }
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    const newReport: GoogleSheetsReport = {
      id,
      title: data.title,
      dataMartId: data.dataMartId,
      dataDestinationId: data.dataDestinationId,
      destinationConfig: data.destinationConfig,
      lastRunDate: data.lastRunDate ?? null,
      lastRunStatus: data.lastRunStatus ?? GoogleSheetsReportStatusEnum.IN_PROGRESS,
      ...(data.lastRunError ? { lastRunError: data.lastRunError } : {}),
    };
    mockData = [newReport, ...mockData];
    await new Promise(res => setTimeout(res, 300));
    return newReport;
  },
  /**
   * Update an existing Google Sheets report by id (mock)
   * @param id - report id
   * @param data - partial report data to update
   * @returns Promise with updated GoogleSheetsReport
   * @throws Error if id not found or required fields are missing
   */
  async updateGoogleSheet(
    id: string,
    data: Partial<GoogleSheetsReport>
  ): Promise<GoogleSheetsReport> {
    const index = mockData.findIndex(item => item.id === id);
    if (index === -1) {
      throw new Error('Not found');
    }
    // Validation: if title, dataMartId, dataDestinationId, or destinationConfig is passed, they must not be empty
    if ('title' in data && !data.title) {
      throw new Error('Missing required field: title');
    }
    if ('dataMartId' in data && !data.dataMartId) {
      throw new Error('Missing required field: dataMartId');
    }
    if ('dataDestinationId' in data && !data.dataDestinationId) {
      throw new Error('Missing required field: dataDestinationId');
    }
    if ('destinationConfig' in data && !data.destinationConfig) {
      throw new Error('Missing required field: destinationConfig');
    }
    // Update only the passed fields
    const updated = {
      ...mockData[index],
      ...data,
    };
    mockData[index] = updated;
    await new Promise(res => setTimeout(res, 300));
    return updated;
  },
};
