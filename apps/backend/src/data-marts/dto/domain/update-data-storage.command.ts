import { DataStorageConfig } from '../../data-storage-types/data-storage-config.type';

export class UpdateDataStorageCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly config: DataStorageConfig,
    public readonly title: string,
    /** Absent keeps the binding; null is rejected. */
    public readonly reusableCredentialId?: string | null,
    // Legacy: remove with LegacyStorageCredentialReader.
    /** True when the request carries `credentials`, `credentialId` or `sourceStorageId`. */
    public readonly sentOldCredentialFields: boolean = false,
    public readonly isPluginAuth: boolean = false,
    public readonly ownerIds?: string[],
    public readonly userId: string = '',
    public readonly roles: string[] = [],
    public readonly availableForUse?: boolean,
    public readonly availableForMaintenance?: boolean,
    public readonly contextIds?: string[]
  ) {}

  hasConfig(): boolean {
    return this.config !== undefined;
  }
}
