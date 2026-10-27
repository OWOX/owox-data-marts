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
      /** The Credential (Google Service Account or Sheets Google account) the Destination uses */
      reusableCredentialId: string;
      ownerIds?: string[];
      /** Optional destination-level config: Drive folder for auto-created Sheets (send folderUrl; id derived server-side) */
      config?: { folderId?: string | null; folderUrl?: string | null };
    }
  | {
      /** Title of the data destination */
      title: string;
      /**
       * Type of the data destination. Excel sends no credentials: the add-in authenticates as
       * the user and reads its own data, so there is no secret for the server to hold.
       */
      type: DataDestinationType.EXCEL;
      ownerIds?: string[];
    }
  | {
      /** Title of the data destination */
      title: string;
      /** Type of the data destination */
      type: DataDestinationType.LOOKER_STUDIO;
      /** Minimal credentials object for Looker Studio */
      credentials: { type: DataDestinationCredentialsType.LOOKER_STUDIO_CREDENTIALS };
      ownerIds?: string[];
    }
  | {
      title: string;
      type: DataDestinationType.EMAIL;
      credentials: { type: DataDestinationCredentialsType.EMAIL_CREDENTIALS; to: string[] };
      ownerIds?: string[];
    }
  | {
      title: string;
      type: DataDestinationType.SLACK;
      credentials: { type: DataDestinationCredentialsType.EMAIL_CREDENTIALS; to: string[] };
      ownerIds?: string[];
    }
  | {
      title: string;
      type: DataDestinationType.MS_TEAMS;
      credentials: { type: DataDestinationCredentialsType.EMAIL_CREDENTIALS; to: string[] };
      ownerIds?: string[];
    }
  | {
      title: string;
      type: DataDestinationType.GOOGLE_CHAT;
      /** Webhook delivery: the Google Chat webhook Credential */
      reusableCredentialId: string;
      ownerIds?: string[];
    }
  | {
      title: string;
      type: DataDestinationType.GOOGLE_CHAT;
      credentials: { type: DataDestinationCredentialsType.EMAIL_CREDENTIALS; to: string[] };
      ownerIds?: string[];
    };
