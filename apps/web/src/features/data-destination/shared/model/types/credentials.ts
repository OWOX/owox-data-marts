import type { EmailCredentials } from './email-credentials.ts';
import type { LookerStudioCredentials } from './looker-studio-credentials.ts';
import type { GoogleSheetsCredentials } from './data-destination.ts';
import type { GoogleChatCredentials } from './google-chat-credentials.ts';
import type { ExcelCredentials } from './excel-credentials.ts';

export type DataDestinationCredentials =
  | GoogleSheetsCredentials
  | LookerStudioCredentials
  | EmailCredentials
  | GoogleChatCredentials
  | ExcelCredentials;
