import { DestinationTypeConfigEnum } from '../../enums';
import type { ReportConditionEnum } from '../../enums/report-condition.enum.ts';

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

export interface EmailDestinationConfigDto {
  type: DestinationTypeConfigEnum.EMAIL_CONFIG;
  reportCondition: ReportConditionEnum;
  subject: string;
  messageTemplate: string;
}

/**
 * Union type for destination configurations
 */
export type DestinationConfigDto =
  | GoogleSheetsDestinationConfigDto
  | LookerStudioDestinationConfigDto
  | EmailDestinationConfigDto;

/**
 * DTO for updating an existing report
 */
export interface UpdateReportRequestDto {
  title: string;
  dataDestinationId: string;
  destinationConfig: DestinationConfigDto;
}
