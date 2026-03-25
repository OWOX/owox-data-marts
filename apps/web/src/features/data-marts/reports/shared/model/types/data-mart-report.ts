import {
  DestinationTypeConfigEnum,
  TemplateSourceTypeEnum,
  type ReportStatusEnum,
} from '../../enums';
import { type DataDestination } from '../../../../../data-destination';
import type { DataMart } from '../../../../edit';
import type { ReportConditionEnum } from '../../enums/report-condition.enum.ts';
import type { UserProjection } from '../../../../../../shared/types';

export interface GoogleSheetsDestinationConfig {
  type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG;
  spreadsheetId: string;
  sheetId: string;
}

export interface LookerStudioDestinationConfig {
  type: DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG;
  cacheLifetime: number; // in seconds
}

export type TemplateSourceType = TemplateSourceTypeEnum;

/**
 * Configuration for CUSTOM_MESSAGE template source
 */
export interface CustomMessageTemplateConfig {
  messageTemplate: string;
}

/**
 * Configuration for INSIGHT_TEMPLATE template source
 */
export interface InsightTemplateConfig {
  insightTemplateId: string;
}

/**
 * Template source configuration
 */
export interface CustomMessageTemplateSource {
  type: TemplateSourceTypeEnum.CUSTOM_MESSAGE;
  config: CustomMessageTemplateConfig;
}

export interface InsightTemplateSource {
  type: TemplateSourceTypeEnum.INSIGHT_TEMPLATE;
  config: InsightTemplateConfig;
}

export type TemplateSource = CustomMessageTemplateSource | InsightTemplateSource;

export interface EmailDestinationConfig {
  type: DestinationTypeConfigEnum.EMAIL_CONFIG;
  reportCondition: ReportConditionEnum;
  subject: string;
  templateSource: TemplateSource;
}

export type DestinationConfig =
  | GoogleSheetsDestinationConfig
  | LookerStudioDestinationConfig
  | EmailDestinationConfig;

export function isGoogleSheetsDestinationConfig(
  config: DestinationConfig
): config is GoogleSheetsDestinationConfig {
  return config.type === DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG;
}

export function isLookerStudioDestinationConfig(
  config: DestinationConfig
): config is LookerStudioDestinationConfig {
  return config.type === DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG;
}

export function isEmailDestinationConfig(
  config: DestinationConfig
): config is EmailDestinationConfig {
  return config.type === DestinationTypeConfigEnum.EMAIL_CONFIG;
}

export function isInsightTemplateSource(
  templateSource: TemplateSource
): templateSource is InsightTemplateSource {
  return templateSource.type === TemplateSourceTypeEnum.INSIGHT_TEMPLATE;
}

export function isCustomMessageTemplateSource(
  templateSource: TemplateSource
): templateSource is CustomMessageTemplateSource {
  return templateSource.type === TemplateSourceTypeEnum.CUSTOM_MESSAGE;
}

export interface DataMartReport {
  id: string;
  title: string;
  dataMart: Pick<DataMart, 'id'>;
  dataDestination: DataDestination;
  destinationConfig: DestinationConfig;
  lastRunDate: Date | null;
  lastRunStatus: ReportStatusEnum | null;
  lastRunError: string | null;
  runsCount: number;
  createdAt: Date;
  modifiedAt: Date;
  createdByUser?: UserProjection | null;
}
