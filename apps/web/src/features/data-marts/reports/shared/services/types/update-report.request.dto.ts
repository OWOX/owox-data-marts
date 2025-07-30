import { DestinationTypeConfigEnum } from '../../enums';

/**
 * DTO for Google Sheets destination configuration
 */
export interface GoogleSheetsDestinationConfigDto {
  type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG;
  spreadsheetId: string;
  sheetId: number;
}

/**
 * DTO for Looker Studio destination configuration
 */
export interface LookerStudioDestinationConfigDto {
  type: DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG;
  cacheLifetime: number;
}

/**
 * Union type for destination configurations
 */
export type DestinationConfigDto =
  | GoogleSheetsDestinationConfigDto
  | LookerStudioDestinationConfigDto;

/**
 * DTO for updating an existing report
 */
export interface UpdateReportRequestDto {
  title: string;
  dataDestinationId: string;
  destinationConfig: DestinationConfigDto;
}
