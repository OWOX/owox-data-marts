import type { GoogleServiceAccountCredentialsDto } from '../../../../../shared/types';
import { DataDestinationCredentialsType, DataDestinationType } from '../../enums';

/**
 * Data transfer object for creating a new data destination
 */
export type CreateDataDestinationRequestDto =
  | {
      /** Title of the data destination */
      title: string;
      /** Type of the data destination */
      type: DataDestinationType.GOOGLE_SHEETS;
      /** Credentials required for Google Sheets */
      credentials: GoogleServiceAccountCredentialsDto;
    }
  | {
      /** Title of the data destination */
      title: string;
      /** Type of the data destination */
      type: DataDestinationType.LOOKER_STUDIO;
      /** Minimal credentials object for Looker Studio */
      credentials: { type: DataDestinationCredentialsType.LOOKER_STUDIO_CREDENTIALS };
    };
