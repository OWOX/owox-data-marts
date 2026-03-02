import { type GoogleServiceAccountCredentialsDto } from '../../../../../shared/types';
import type { EmailCredentials } from '../../model/types/email-credentials.ts';

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
  credentials?: GoogleServiceAccountCredentialsDto | EmailCredentials;

  /**
   * Credential ID for OAuth-based authentication (null to disconnect)
   */
  credentialId?: string | null;
}
