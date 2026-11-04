import { DataStorageConfig } from '../../data-storage-types/data-storage-config.type';

export interface UpdateDataStorageCommandProps {
  id: string;
  projectId: string;
  config?: DataStorageConfig;
  title?: string;
  /** Absent keeps the binding; null is rejected. */
  reusableCredentialId?: string | null;
  // Legacy: remove with LegacyStorageCredentialReader.
  /** True when the request carries `credentials`, `credentialId` or `sourceStorageId`. */
  sentOldCredentialFields?: boolean;
  isPluginAuth?: boolean;
  ownerIds?: string[];
  userId?: string;
  roles?: string[];
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
  contextIds?: string[];
}

export class UpdateDataStorageCommand {
  public readonly id: string;
  public readonly projectId: string;
  public readonly config?: DataStorageConfig;
  public readonly title?: string;
  public readonly reusableCredentialId?: string | null;
  public readonly sentOldCredentialFields: boolean;
  public readonly isPluginAuth: boolean;
  public readonly ownerIds?: string[];
  public readonly userId: string;
  public readonly roles: string[];
  public readonly availableForUse?: boolean;
  public readonly availableForMaintenance?: boolean;
  public readonly contextIds?: string[];

  constructor(props: UpdateDataStorageCommandProps) {
    this.id = props.id;
    this.projectId = props.projectId;
    this.config = props.config;
    this.title = props.title;
    this.reusableCredentialId = props.reusableCredentialId;
    this.sentOldCredentialFields = props.sentOldCredentialFields ?? false;
    this.isPluginAuth = props.isPluginAuth ?? false;
    this.ownerIds = props.ownerIds;
    this.userId = props.userId ?? '';
    this.roles = props.roles ?? [];
    this.availableForUse = props.availableForUse;
    this.availableForMaintenance = props.availableForMaintenance;
    this.contextIds = props.contextIds;
  }
}
