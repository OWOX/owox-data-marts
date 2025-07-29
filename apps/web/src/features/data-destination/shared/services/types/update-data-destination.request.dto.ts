import { type GoogleServiceAccountCredentialsDto } from '../../../../../shared/types';
import type { LookerStudioCredentialsDto } from './looker-studio-credentials.dto.ts';

/**
 * Data transfer object for updating a data destination
 */
export interface UpdateDataDestinationRequestDto {
  /**
   * Title of the data destination
   */
  title: string;

  /**
   * Credentials required for the selected destination type
   */
  credentials: GoogleServiceAccountCredentialsDto | LookerStudioCredentialsDto;
}
