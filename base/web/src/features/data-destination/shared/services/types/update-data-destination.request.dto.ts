import { type GoogleServiceAccountCredentialsDto } from '../../../../../shared/types';
import type { LookerStudioCredentialsRequestDto } from './looker-studio-credentials.request.dto.ts';

/**
 * Data transfer object for updating a data destination
 */
export interface UpdateDataDestinationRequestDto {
  /**
   * Title of the data destination
   */
  title: string;

  /**
   * Credentials for the selected destination type
   */
  credentials?: GoogleServiceAccountCredentialsDto | LookerStudioCredentialsRequestDto;
}
