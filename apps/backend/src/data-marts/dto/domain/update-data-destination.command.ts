import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';
import { DestinationConfig } from '../../entities/destination-config.type';

export interface UpdateDataDestinationCommandProps {
  id: string;
  projectId: string;
  title?: string;
  credentials?: DataDestinationCredentials;
  /** Absent keeps the binding; null is rejected. */
  reusableCredentialId?: string | null;
  /** True when the request carries `credentialId` or `sourceDestinationId`. */
  sentOldCredentialFields?: boolean;
  ownerIds?: string[];
  userId?: string;
  roles?: string[];
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
  contextIds?: string[];
  config?: DestinationConfig | null;
  isPluginCall?: boolean;
}

export class UpdateDataDestinationCommand {
  public readonly id: string;
  public readonly projectId: string;
  public readonly title?: string;
  public readonly credentials?: DataDestinationCredentials;
  public readonly reusableCredentialId?: string | null;
  public readonly sentOldCredentialFields: boolean;
  public readonly ownerIds?: string[];
  public readonly userId: string;
  public readonly roles: string[];
  public readonly availableForUse?: boolean;
  public readonly availableForMaintenance?: boolean;
  public readonly contextIds?: string[];
  public readonly config?: DestinationConfig | null;
  public readonly isPluginCall: boolean;

  constructor(props: UpdateDataDestinationCommandProps) {
    this.id = props.id;
    this.projectId = props.projectId;
    this.title = props.title;
    this.credentials = props.credentials;
    this.reusableCredentialId = props.reusableCredentialId;
    this.sentOldCredentialFields = props.sentOldCredentialFields ?? false;
    this.ownerIds = props.ownerIds;
    this.userId = props.userId ?? '';
    this.roles = props.roles ?? [];
    this.availableForUse = props.availableForUse;
    this.availableForMaintenance = props.availableForMaintenance;
    this.contextIds = props.contextIds;
    this.config = props.config;
    this.isPluginCall = props.isPluginCall ?? false;
  }
}
