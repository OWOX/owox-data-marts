import type { GoogleServiceAccountCredentials } from '../../../../../shared/types';
import type { LookerStudioCredentials } from './looker-studio-credentials.ts';

export type DataDestinationCredentials = GoogleServiceAccountCredentials | LookerStudioCredentials;
