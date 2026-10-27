import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../../data-destination-types/data-destination-credentials.type';
import { DestinationConfig } from '../../entities/destination-config.type';

export interface CreateDataDestinationCommandProps {
  projectId: string;
  title: string;
  type: DataDestinationType;
  userId: string;
  credentials?: DataDestinationCredentials;
  /** The Credential to bind; null is rejected. */
  reusableCredentialId?: string | null;
  /** True when the request carries `credentialId` or `sourceDestinationId`. */
  sentOldCredentialFields?: boolean;
  isPluginCall?: boolean;
  ownerIds?: string[];
  roles?: string[];
  config?: DestinationConfig | null;
  availableForUse?: boolean;
}

export class CreateDataDestinationCommand {
  public readonly projectId: string;
  public readonly title: string;
  public readonly type: DataDestinationType;
  public readonly userId: string;
  public readonly credentials?: DataDestinationCredentials;
  public readonly reusableCredentialId?: string | null;
  public readonly sentOldCredentialFields: boolean;
  public readonly isPluginCall: boolean;
  public readonly ownerIds?: string[];
  public readonly roles: string[];
  public readonly config?: DestinationConfig | null;
  public readonly availableForUse?: boolean;

  constructor(props: CreateDataDestinationCommandProps) {
    this.projectId = props.projectId;
    this.title = props.title;
    this.type = props.type;
    this.userId = props.userId;
    this.credentials = props.credentials;
    this.reusableCredentialId = props.reusableCredentialId;
    this.sentOldCredentialFields = props.sentOldCredentialFields ?? false;
    this.isPluginCall = props.isPluginCall ?? false;
    this.ownerIds = props.ownerIds;
    this.roles = props.roles ?? [];
    this.config = props.config;
    this.availableForUse = props.availableForUse;
  }
}
