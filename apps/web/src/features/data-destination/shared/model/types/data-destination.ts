import { DataDestinationType } from '../../enums';
import type { DataDestinationCredentials } from './credentials.ts';
import type { GoogleServiceAccountCredentials } from '../../../../../shared/types';
import type { LookerStudioCredentials } from './looker-studio-credentials.ts';

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

export interface LookerStudioDataDestination extends BaseDataDestination<LookerStudioCredentials> {
  type: DataDestinationType.LOOKER_STUDIO;
  credentials: LookerStudioCredentials;
}

export type DataDestination = GoogleSheetsDataDestination | LookerStudioDataDestination;

export function isGoogleSheetDataDestination(dataDestination: DataDestination) {
  return dataDestination.type === DataDestinationType.GOOGLE_SHEETS;
}

export function isLookerStudioDataDestination(dataDestination: DataDestination) {
  return dataDestination.type === DataDestinationType.LOOKER_STUDIO;
}
