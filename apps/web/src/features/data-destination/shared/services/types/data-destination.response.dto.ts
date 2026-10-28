import { DataDestinationCredentialsType, DataDestinationType } from '../../enums';
import type { ContextSummary } from '../../../../contexts/types/context.types';
import type { DestinationCredentialSummary } from '../../model/types/data-destination';

/**
 * Looker Studio credentials response
 */
export interface LookerStudioCredentialsResponse {
  deploymentUrl: string;
  destinationId: string;
  destinationSecretKey: string;
  type: DataDestinationCredentialsType.LOOKER_STUDIO_CREDENTIALS;
}

export interface EmailCredentialsResponse {
  to: string[];
  type: DataDestinationCredentialsType.EMAIL_CREDENTIALS;
}

/** Public details of a Google Sheets Destination's key, for the Sheets add-in; the web ignores them. */
export type GoogleSheetsCredentialsResponse =
  | {
      type: 'google-sheets-credentials';
      serviceAccountKey: {
        type: 'service_account';
        project_id: string;
        client_email: string;
        client_id?: string;
      };
    }
  | {
      type: 'google-sheets-oauth-credentials';
      identity: { email: string; name?: string; picture?: string } | null;
    };

/** A Google Chat webhook Destination says only that it has a webhook; the web ignores it. */
export interface GoogleChatCredentialsResponse {
  type: DataDestinationCredentialsType.GOOGLE_CHAT_CREDENTIALS;
  configured: true;
}

/**
 * Data destination response data transfer object
 */
export interface DataDestinationResponseDto {
  /**
   * Unique identifier of the data destination
   */
  id: string;

  /**
   * Title of the data destination
   */
  title: string;

  /**
   * Type of the data destination
   */
  type: DataDestinationType;

  /**
   * Project ID
   */
  projectId: string;

  /**
   * Credentials for the destination; absent when a Google Sheets or Google Chat webhook key has none to show
   */
  credentials?:
    | LookerStudioCredentialsResponse
    | EmailCredentialsResponse
    | GoogleSheetsCredentialsResponse
    | GoogleChatCredentialsResponse;

  /**
   * Creation timestamp
   */
  createdAt: Date;

  /**
   * Last modification timestamp
   */
  modifiedAt: Date;

  /**
   * Credential ID (references data_destination_credentials table)
   */
  credentialId?: string | null;

  /**
   * Details about the user who created this destination
   */
  createdByUser?: import('../../../../../shared/types').UserProjection | null;

  ownerUsers?: import('../../../../../shared/types').UserProjection[];
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
  contexts?: ContextSummary[];

  /** Google Sheets and Google Chat webhook delivery only. */
  reusableCredential?: DestinationCredentialSummary | null;

  /**
   * Optional destination-level config (e.g. Drive folder for auto-created Google Sheets)
   */
  config?: { folderId?: string | null; folderUrl?: string | null } | null;
}
