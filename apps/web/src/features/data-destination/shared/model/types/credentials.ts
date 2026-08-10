import type { GoogleServiceAccountCredentials } from '../../../../../shared/types';
import type { EmailCredentials } from './email-credentials.ts';
import type { LookerStudioCredentials } from './looker-studio-credentials.ts';
import type { GoogleSheetsOAuthCredentials } from './data-destination.ts';
import type { GoogleChatCredentials } from './google-chat-credentials.ts';

export type DataDestinationCredentials =
  | GoogleServiceAccountCredentials
  | GoogleSheetsOAuthCredentials
  | LookerStudioCredentials
  | EmailCredentials
  | GoogleChatCredentials;
