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
import { DAY_MS, OwoxStorageDeletionReason, scheduledDeletion } from './owox-storage-lifecycle';
import { ManagedStorageService } from './managed-storage.service';
import { OwoxStorageConfigService } from './owox-storage-config.service';
import { OwoxStoragePlanService } from './owox-storage-plan.service';

export interface OwoxStorageUsage {
  plan: ProjectPlanType;
  usedBytes: number;
  /** The FREE limit, or the volume included in PAID. */
  limitBytes: number;
  tables: ManagedTable[];
  /** The scheduled deletion; an inactivity one only shows after IDLE_NOTICE_DAYS idle days. */
  deletion: { reason: OwoxStorageDeletionReason; date: Date } | null;
  deletedAt: Date | null;
}

const IDLE_NOTICE_DAYS = 7;

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
    if (record.deprovisionedAt) {
      return {
        plan,
        usedBytes: 0,
        limitBytes: this.limitFor(record, plan),
        tables: [],
        deletion: null,
        deletedAt: record.deprovisionedAt,
      };
    }
    return this.measure(record, plan);
  }

  /** Refuses a load into a deleted or NOT_PAID storage, or a FREE one that is full; PAID, no record and an unreadable size let it go. */
  async assertCanLoad(storageId: string): Promise<void> {
    const record = await this.managedStorages.findByStorageId(storageId);
    if (!record) return;
    if (record.deprovisionedAt) {
      throw new ProjectOperationBlockedException([ProjectBlockedReason.OWOX_STORAGE_DELETED]);
    }
    const plan = await this.plans.planFor(record.projectId);
    if (!plan) {
      this.logger.warn(
        `Could not read the plan of the project for OWOX Storage ${record.datasetId}; the connector run goes ahead.`
      );
      return;
    }
    if (plan === ProjectPlanType.NOT_PAID) {
      throw new ProjectOperationBlockedException([ProjectBlockedReason.OWOX_STORAGE_NOT_PAID]);
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

  private limitFor(record: ManagedStorage, plan: ProjectPlanType): number {
    const settings = this.config.getSettings();
    return (
      record.storageLimitBytes ??
      (plan === ProjectPlanType.PAID
        ? settings.paidIncludedStorageBytes
        : settings.freeStorageLimitBytes)
    );
  }

  private async measure(record: ManagedStorage, plan: ProjectPlanType): Promise<OwoxStorageUsage> {
    const tables = await this.engine.listTables(record);
    const now = new Date();
    const deletion = scheduledDeletion(record, plan, this.config.getSettings(), now);
    const idleSince = record.lastActivityAt ?? record.createdAt;
    const idleLongEnough = now.getTime() - idleSince.getTime() >= IDLE_NOTICE_DAYS * DAY_MS;
    return {
      plan,
      usedBytes: tables.reduce((sum, table) => sum + table.sizeBytes, 0),
      limitBytes: this.limitFor(record, plan),
      tables,
      deletion: deletion?.reason === 'INACTIVE' && !idleLongEnough ? null : deletion,
      deletedAt: null,
    };
  }
}
