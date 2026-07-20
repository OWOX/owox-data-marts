import { type GoogleServiceAccountCredentialsDto } from '../../../../../shared/types';
import type { EmailCredentials } from '../../model/types/email-credentials.ts';
import { DataDestinationCredentialsType } from '../../enums';

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
  credentials?:
    | GoogleServiceAccountCredentialsDto
    | EmailCredentials
    | {
        type: DataDestinationCredentialsType.GOOGLE_CHAT_CREDENTIALS;
        webhookUrl: string;
      };

  /**
   * Credential ID for OAuth-based authentication (null to disconnect)
   */
  credentialId?: string | null;

  /**
   * Source destination ID for credential copy
   */
  sourceDestinationId?: string;

  ownerIds?: string[];

  availableForUse?: boolean;
  availableForMaintenance?: boolean;

  contextIds?: string[];

  /** Optional destination-level config: Drive folder for auto-created Sheets (send folderUrl; id derived server-side) */
  config?: { folderId?: string | null; folderUrl?: string | null };
}
