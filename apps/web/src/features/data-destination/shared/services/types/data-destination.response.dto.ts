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
  urlHost: string;
  secretKey: string;
  type: DataDestinationCredentialsType.LOOKER_STUDIO_CREDENTIALS;
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
  credentials: GoogleSheetsCredentialsResponse | LookerStudioCredentialsResponse;

  /**
   * Creation timestamp
   */
  createdAt: Date;

  /**
   * Last modification timestamp
   */
  modifiedAt: Date;
}
