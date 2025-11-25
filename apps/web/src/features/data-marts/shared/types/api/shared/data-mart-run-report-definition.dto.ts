export interface GoogleSheetsConfigDto {
  type: string;
  spreadsheetId: string;
  sheetId: number;
}

export interface LookerStudioConfigDto {
  type: string;
  cacheLifetime: number;
}

export type DataMartRunReportDestinationConfigDto = GoogleSheetsConfigDto | LookerStudioConfigDto;

export interface DataMartRunReportDefinitionDto {
  title: string;
  destination: {
    id: string;
    title: string;
    type: string;
  };
  destinationConfig: DataMartRunReportDestinationConfigDto;
}

export interface DataMartRunInsightDefinitionDto {
  title: string;
  template: string | null;
}
