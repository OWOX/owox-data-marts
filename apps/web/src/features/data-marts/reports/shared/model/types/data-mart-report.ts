import { DestinationTypeConfigEnum, type ReportStatusEnum } from '../../enums';
import { type DataDestination } from '../../../../../data-destination';
import type { DataMart } from '../../../../edit';
import type { ReportConditionEnum } from '../../enums/report-condition.enum.ts';

export interface GoogleSheetsDestinationConfig {
  type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG;
  spreadsheetId: string;
  sheetId: string;
}

export interface LookerStudioDestinationConfig {
  type: DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG;
  cacheLifetime: number; // in seconds
}

export interface EmailDestinationConfig {
  type: DestinationTypeConfigEnum.EMAIL_CONFIG;
  reportCondition: ReportConditionEnum;
  subject: string;
  messageTemplate: string;
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
}
