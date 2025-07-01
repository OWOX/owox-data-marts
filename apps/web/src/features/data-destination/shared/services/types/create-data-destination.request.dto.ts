import { DataDestinationType } from '../../enums';
import type { GoogleServiceAccountCredentialsDto } from '../../../../../shared/types';

/**
 * Data transfer object for creating a new data destination
 */
export interface CreateDataDestinationRequestDto {
  /**
   * Title of the data destination
   */
  title: string;

  /**
   * Type of the data destination
   */
  type: DataDestinationType;

  /**
   * Credentials required for the selected destination type
   */
  credentials: GoogleServiceAccountCredentialsDto;
}
