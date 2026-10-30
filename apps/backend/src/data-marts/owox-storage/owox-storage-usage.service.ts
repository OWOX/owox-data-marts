import { Inject, Injectable, Logger } from '@nestjs/common';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import type { ManagedStorage } from '../entities/managed-storage.entity';
import { ProjectBlockedReason } from '../enums/project-blocked-reason.enum';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import { describeGoogleError } from './engine/bigquery-managed-storage.engine';
import {
  MANAGED_STORAGE_ENGINE,
  ManagedStorageEngine,
  ManagedTable,
} from './engine/managed-storage-engine';
import { ManagedStorageService } from './managed-storage.service';
import { OwoxStorageConfigService } from './owox-storage-config.service';
import { OwoxStoragePlanService } from './owox-storage-plan.service';

export interface OwoxStorageUsage {
  plan: ProjectPlanType;
  usedBytes: number;
  /** The FREE limit, or the volume included in PAID. */
  limitBytes: number;
  tables: ManagedTable[];
}

@Injectable()
export class OwoxStorageUsageService {
  private readonly logger = new Logger(OwoxStorageUsageService.name);

  constructor(
    @Inject(MANAGED_STORAGE_ENGINE) private readonly engine: ManagedStorageEngine,
    private readonly plans: OwoxStoragePlanService,
    private readonly managedStorages: ManagedStorageService,
    private readonly config: OwoxStorageConfigService
  ) {}

  async getUsage(record: ManagedStorage): Promise<OwoxStorageUsage> {
    const plan = await this.plans.planFor(record.projectId);
    if (!plan) throw new Error('The plan of the project cannot be read');
    return this.measure(record, plan);
  }

  /** Refuses a load into a FREE storage that is full; PAID, no record and an unreadable size let it go. */
  async assertCanLoad(storageId: string): Promise<void> {
    const record = await this.managedStorages.findByStorageId(storageId);
    if (!record) return;
    const plan = await this.plans.planFor(record.projectId);
    if (!plan) {
      this.logger.warn(
        `Could not read the plan of the project for OWOX Storage ${record.datasetId}; the connector run goes ahead.`
      );
      return;
    }
    if (plan === ProjectPlanType.PAID) return;

    let usage: OwoxStorageUsage;
    try {
      usage = await this.measure(record, plan);
    } catch (error) {
      this.logger.warn(
        `Could not read the size of OWOX Storage ${record.datasetId}${describeGoogleError(error)}; the connector run goes ahead.`
      );
      return;
    }
    if (usage.usedBytes >= usage.limitBytes) {
      throw new ProjectOperationBlockedException([ProjectBlockedReason.OWOX_STORAGE_FULL]);
    }
  }

  private async measure(record: ManagedStorage, plan: ProjectPlanType): Promise<OwoxStorageUsage> {
    const settings = this.config.getSettings();
    const tables = await this.engine.listTables(record);
    return {
      plan,
      usedBytes: tables.reduce((sum, table) => sum + table.sizeBytes, 0),
      limitBytes:
        record.storageLimitBytes ??
        (plan === ProjectPlanType.PAID
          ? settings.paidIncludedStorageBytes
          : settings.freeStorageLimitBytes),
      tables,
    };
  }
}
