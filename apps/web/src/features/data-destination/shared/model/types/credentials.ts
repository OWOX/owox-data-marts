import type { GoogleServiceAccountCredentials } from '../../../../../shared/types';
import type { EmailCredentials } from './email-credentials.ts';
import type { LookerStudioCredentials } from './looker-studio-credentials.ts';

export type DataDestinationCredentials =
  | GoogleServiceAccountCredentials
  | LookerStudioCredentials
  | EmailCredentials;
