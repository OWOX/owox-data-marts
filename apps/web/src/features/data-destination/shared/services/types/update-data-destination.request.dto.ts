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
    | { type: DataDestinationCredentialsType.EMAIL_CREDENTIALS; to: string[] }
    | { type: DataDestinationCredentialsType.LOOKER_STUDIO_CREDENTIALS };

  /**
   * Binds this Credential (Google Sheets, Google Chat webhook); left out to keep the current one
   */
  reusableCredentialId?: string;

  ownerIds?: string[];

  availableForUse?: boolean;
  availableForMaintenance?: boolean;

  contextIds?: string[];

  /** Optional destination-level config: Drive folder for auto-created Sheets (send folderUrl; id derived server-side) */
  config?: { folderId?: string | null; folderUrl?: string | null };
}
