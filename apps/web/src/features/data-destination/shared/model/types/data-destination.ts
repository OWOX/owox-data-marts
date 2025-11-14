import { DataDestinationType } from '../../enums';
import type { DataDestinationCredentials } from './credentials.ts';
import type { GoogleServiceAccountCredentials } from '../../../../../shared/types';
import type { EmailCredentials } from './email-credentials.ts';
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

export interface EmailDataDestination extends BaseDataDestination<EmailCredentials> {
  type: DataDestinationType.EMAIL;
  credentials: EmailCredentials;
}

export interface SlackDataDestination extends BaseDataDestination<EmailCredentials> {
  type: DataDestinationType.SLACK;
  credentials: EmailCredentials;
}

export interface MsTeamsDataDestination extends BaseDataDestination<EmailCredentials> {
  type: DataDestinationType.MS_TEAMS;
  credentials: EmailCredentials;
}

export interface GoogleChatDataDestination extends BaseDataDestination<EmailCredentials> {
  type: DataDestinationType.GOOGLE_CHAT;
  credentials: EmailCredentials;
}

export type DataDestination =
  | GoogleSheetsDataDestination
  | LookerStudioDataDestination
  | EmailDataDestination
  | SlackDataDestination
  | MsTeamsDataDestination
  | GoogleChatDataDestination;

export function isGoogleSheetDataDestination(dataDestination: DataDestination) {
  return dataDestination.type === DataDestinationType.GOOGLE_SHEETS;
}

export function isLookerStudioDataDestination(dataDestination: DataDestination) {
  return dataDestination.type === DataDestinationType.LOOKER_STUDIO;
}

export function isEmailDataDestination(dataDestination: DataDestination) {
  return dataDestination.type === DataDestinationType.EMAIL;
}

export function isSlackDataDestination(dataDestination: DataDestination) {
  return dataDestination.type === DataDestinationType.SLACK;
}

export function isMsTeamsDataDestination(dataDestination: DataDestination) {
  return dataDestination.type === DataDestinationType.MS_TEAMS;
}

export function isGoogleChatDataDestination(dataDestination: DataDestination) {
  return dataDestination.type === DataDestinationType.GOOGLE_CHAT;
}
