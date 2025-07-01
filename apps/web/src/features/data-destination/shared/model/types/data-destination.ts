import { DataDestinationType } from '../../enums';
import type { DataDestinationCredentials } from './credentials.ts';
import type { GoogleServiceAccountCredentials } from '../../../../../shared/types';

export interface BaseDataDestination<T extends DataDestinationCredentials> {
  id: string;
  title: string;
  type: DataDestinationType;
  projectId: string;
  credentials: T;
  createdAt: Date;
  modifiedAt: Date;
}

export interface GoogleSheetsCredentials {
  serviceAccountKey: string;
}

export interface GoogleSheetsDataDestination
  extends BaseDataDestination<GoogleServiceAccountCredentials> {
  type: DataDestinationType.GOOGLE_SHEETS;
  credentials: GoogleServiceAccountCredentials;
}

export type DataDestination = GoogleSheetsDataDestination;

export function isGoogleSheetDataDestination(dataDestination: DataDestination) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return dataDestination.type === DataDestinationType.GOOGLE_SHEETS;
}
