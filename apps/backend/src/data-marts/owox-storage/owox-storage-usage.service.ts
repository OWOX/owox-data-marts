import { Inject, Injectable, Logger } from '@nestjs/common';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import type { ManagedStorage } from '../entities/managed-storage.entity';
import { ProjectBlockedReason } from '../enums/project-blocked-reason.enum';
import { describeGoogleError } from './engine/bigquery-managed-storage.engine';
import {
  MANAGED_STORAGE_ENGINE,
  ManagedStorageEngine,
  ManagedTable,
} from './engine/managed-storage-engine';
import { ManagedStorageService } from './managed-storage.service';
import { OwoxStorageConfigService } from './owox-storage-config.service';

export interface OwoxStorageUsage {
  usedBytes: number;
  /** The size limit of the storage, the same for every project unless support changed it. */
  limitBytes: number;
  tables: ManagedTable[];
  deletedAt: Date | null;
}

const TABLES_TTL_MS = 60_000;

const sumSizes = (tables: ManagedTable[]) =>
  tables.reduce((sum, table) => sum + table.sizeBytes, 0);

@Injectable()
export class OwoxStorageUsageService {
  private readonly logger = new Logger(OwoxStorageUsageService.name);
  private readonly tableLists = new Map<string, { value: ManagedTable[]; expiresAt: number }>();

  constructor(
    @Inject(MANAGED_STORAGE_ENGINE) private readonly engine: ManagedStorageEngine,
    private readonly managedStorages: ManagedStorageService,
    private readonly config: OwoxStorageConfigService
  ) {}

  /** `fresh` skips the cached table list, for an explicit refresh. */
  async getUsage(record: ManagedStorage, fresh = false): Promise<OwoxStorageUsage> {
    const limitBytes = this.limitFor(record);
    if (record.deprovisionedAt) {
      return { usedBytes: 0, limitBytes, tables: [], deletedAt: record.deprovisionedAt };
    }
    const tables = await this.listTables(record, fresh);
    return { usedBytes: sumSizes(tables), limitBytes, tables, deletedAt: null };
  }

  /** Refuses a load into a deleted or full storage; no record and an unreadable size let it go. */
  async assertCanLoad(storageId: string): Promise<void> {
    const record = await this.managedStorages.findByStorageId(storageId);
    if (!record) return;
    if (record.deprovisionedAt) {
      throw new ProjectOperationBlockedException([ProjectBlockedReason.OWOX_STORAGE_DELETED]);
    }
    let tables: ManagedTable[];
    try {
      tables = await this.listTables(record, true);
    } catch (error) {
      this.logger.warn(
        `Could not read the size of OWOX Storage ${record.datasetId}${describeGoogleError(error)}; the connector run goes ahead.`
      );
      return;
    }
    if (sumSizes(tables) >= this.limitFor(record)) {
      throw new ProjectOperationBlockedException([ProjectBlockedReason.OWOX_STORAGE_FULL]);
    }
  }

  private limitFor(record: ManagedStorage): number {
    return record.storageLimitBytes ?? this.config.getSettings().storageLimitBytes;
  }

  /** Drops the cached table list, so the panel shows a change at once. */
  forgetTables(storageId: string): void {
    this.tableLists.delete(storageId);
  }

  // The cache is for the panel; the size gate reads the live list (fresh).
  private async listTables(record: ManagedStorage, fresh: boolean): Promise<ManagedTable[]> {
    const cached = this.tableLists.get(record.storageId);
    if (!fresh && cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await this.engine.listTables(record);
    this.tableLists.set(record.storageId, { value, expiresAt: Date.now() + TABLES_TTL_MS });
    return value;
  }
}
