import { DataDestinationCredentialsType, DataDestinationType } from '../../enums';
import type { GoogleServiceAccount } from '../../../../../shared/types';

/**
 * Google Sheets credentials response
 */
export interface GoogleSheetsCredentialsResponse {
  serviceAccountKey: GoogleServiceAccount;
  type: DataDestinationCredentialsType.GOOGLE_SHEETS_CREDENTIALS;
}

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
   * Credentials for the destination
   */
  credentials:
    | GoogleSheetsCredentialsResponse
    | LookerStudioCredentialsResponse
    | EmailCredentialsResponse;

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
  credentialId?: string;
}
