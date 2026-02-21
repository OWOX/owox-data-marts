import { DataStorageConfig } from '../../data-storage-types/data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-types/data-storage-credentials.type';

export class UpdateDataStorageCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly config: DataStorageConfig,
    public readonly title: string,
    public readonly credentials?: DataStorageCredentials,
    public readonly credentialId?: string | null
  ) {}

  hasCredentials(): boolean {
    return this.credentials !== undefined;
  }

  hasConfig(): boolean {
    return this.config !== undefined;
  }
}
