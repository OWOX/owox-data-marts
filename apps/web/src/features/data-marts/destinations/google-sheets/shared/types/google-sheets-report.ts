export enum GoogleSheetsReportStatusEnum {
  SUCCESS = 'success',
  FAIL = 'fail',
  IN_PROGRESS = 'in progress',
}

export interface GoogleSheetsReport {
  id: string;
  title: string;
  dataMartId: string;
  dataDestinationId: string;
  destinationConfig: {
    type: 'google-sheets-config';
    spreadsheetId: string;
    sheetId: string;
  };
  lastRunDate: string | Date | null;
  lastRunStatus: GoogleSheetsReportStatusEnum;
  lastRunError?: string;
}
