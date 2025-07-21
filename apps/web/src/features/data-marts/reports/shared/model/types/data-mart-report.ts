import { DestinationTypeConfigEnum, type ReportStatusEnum } from '../../enums';
import { type DataDestination } from '../../../../../data-destination';
import type { DataMart } from '../../../../edit';

export interface GoogleSheetsDestinationConfig {
  type: DestinationTypeConfigEnum.GOOGLE_SHEETS_CONFIG;
  spreadsheetId: string;
  sheetId: string;
}

export interface LookerStudioDestinationConfig {
  type: DestinationTypeConfigEnum.LOOKER_STUDIO_CONFIG;
  cacheTime: number; // in seconds
}

export type DestinationConfig = GoogleSheetsDestinationConfig | LookerStudioDestinationConfig;

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
