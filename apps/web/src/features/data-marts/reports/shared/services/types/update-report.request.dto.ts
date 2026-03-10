import { DestinationTypeConfigEnum, TemplateSourceTypeEnum } from '../../enums';
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

export type TemplateSourceType = TemplateSourceTypeEnum;

/**
 * Configuration for CUSTOM_MESSAGE template source
 */
export interface CustomMessageTemplateConfigDto {
  messageTemplate: string;
}

/**
 * Configuration for INSIGHT_TEMPLATE template source
 */
export interface InsightTemplateConfigDto {
  insightTemplateId: string;
}

/**
 * Template source configuration
 */
export interface CustomMessageTemplateSourceDto {
  type: TemplateSourceTypeEnum.CUSTOM_MESSAGE;
  config: CustomMessageTemplateConfigDto;
}

export interface InsightTemplateSourceDto {
  type: TemplateSourceTypeEnum.INSIGHT_TEMPLATE;
  config: InsightTemplateConfigDto;
}

export type TemplateSourceDto = CustomMessageTemplateSourceDto | InsightTemplateSourceDto;

export interface EmailDestinationConfigDto {
  type: DestinationTypeConfigEnum.EMAIL_CONFIG;
  reportCondition: ReportConditionEnum;
  subject: string;
  templateSource: TemplateSourceDto;
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
