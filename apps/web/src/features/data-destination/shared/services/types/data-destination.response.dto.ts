import { DataDestinationType, GoogleSheetCredentialsType } from '../../enums';
import type { GoogleServiceAccount } from '../../../../../shared/types';

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
  credentials: {
    serviceAccountKey: GoogleServiceAccount;
    type: GoogleSheetCredentialsType;
  };

  /**
   * Creation timestamp
   */
  createdAt: Date;

  /**
   * Last modification timestamp
   */
  modifiedAt: Date;
}
