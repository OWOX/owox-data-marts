import { Inject, Injectable, Logger } from '@nestjs/common';
import { describeGoogleError } from './engine/bigquery-managed-storage.engine';
import { MANAGED_STORAGE_ENGINE, ManagedStorageEngine } from './engine/managed-storage-engine';
import { ManagedStorageService } from './managed-storage.service';
import { OwoxStorageConfigService } from './owox-storage-config.service';

/**
 * Finishes the deletions of OWOX Storages that failed partway. In the public preview OWOX deletes
 * no storage on its own: only a customer's delete starts one.
 */
@Injectable()
export class OwoxStorageLifecycleService {
  private readonly logger = new Logger(OwoxStorageLifecycleService.name);

  constructor(
    @Inject(MANAGED_STORAGE_ENGINE) private readonly engine: ManagedStorageEngine,
    private readonly managedStorages: ManagedStorageService,
    private readonly config: OwoxStorageConfigService
  ) {}

  async runDaily(signal?: AbortSignal): Promise<void> {
    if (!this.config.isEnabled()) return;

    for (const pending of await this.managedStorages.findPendingDeprovision()) {
      if (signal?.aborted) return;
      try {
        await this.retryDeprovision(pending.storageId);
      } catch (error) {
        this.logger.error(
          `OWOX Storage ${pending.datasetId} leftovers could not be deleted${describeGoogleError(error)}; retried at the next run.`
        );
      }
    }
  }

  private async retryDeprovision(storageId: string): Promise<void> {
    const record = await this.managedStorages.findByStorageId(storageId);
    if (!record?.deprovisionedAt || !record.deprovisionPending) return;
    await this.engine.deprovision(record);
    await this.managedStorages.setDeprovisionPending(storageId, false);
    this.logger.log(`OWOX Storage ${record.datasetId} leftovers deleted`);
  }
}
