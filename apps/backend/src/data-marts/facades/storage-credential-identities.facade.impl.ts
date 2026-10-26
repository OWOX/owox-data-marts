import { Injectable } from '@nestjs/common';
import { StorageCredentialBindingService } from '../data-storage-types/storage-credential-binding.service';
import { LegacyStorageCredentialReader } from '../services/storage-credential-conversion/legacy-storage-credential-reader.service';
import type { StorageCredentialIdentitiesFacade } from './storage-credential-identities.facade';

@Injectable()
export class StorageCredentialIdentitiesFacadeImpl implements StorageCredentialIdentitiesFacade {
  constructor(
    private readonly storageCredentials: StorageCredentialBindingService,
    private readonly legacy: LegacyStorageCredentialReader
  ) {}

  async identitiesForStorages(
    projectId: string,
    storageIds: readonly string[]
  ): Promise<ReadonlyMap<string, string | null>> {
    const bound = await this.storageCredentials.identitiesForStorages(projectId, storageIds);
    // A bound Storage never falls back to its old row.
    const old = await this.legacy.identities(
      projectId,
      storageIds.filter(id => !bound.has(id))
    );
    return new Map([...old, ...bound]);
  }
}
