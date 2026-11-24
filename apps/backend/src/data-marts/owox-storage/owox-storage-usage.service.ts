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
  /** The size limit of the storage, the same on every plan unless support changed it. */
  limitBytes: number;
  tables: ManagedTable[];
  /** The scheduled deletion; an inactivity one only shows after IDLE_NOTICE_DAYS idle days. */
  deletion: { reason: OwoxStorageDeletionReason; date: Date } | null;
  deletedAt: Date | null;
}

const IDLE_NOTICE_DAYS = 7;

const sumSizes = (tables: ManagedTable[]) =>
  tables.reduce((sum, table) => sum + table.sizeBytes, 0);
const TABLES_TTL_MS = 60_000;

@Injectable()
export class OwoxStorageUsageService {
  private readonly logger = new Logger(OwoxStorageUsageService.name);
  private readonly tableLists = new Map<string, { value: ManagedTable[]; expiresAt: number }>();

  constructor(
    @Inject(MANAGED_STORAGE_ENGINE) private readonly engine: ManagedStorageEngine,
    private readonly plans: OwoxStoragePlanService,
    private readonly managedStorages: ManagedStorageService,
    private readonly config: OwoxStorageConfigService
  ) {}

  async getUsage(record: ManagedStorage): Promise<OwoxStorageUsage> {
    const plan = await this.plans.planFor(record.projectId);
    if (record.deprovisionedAt) {
      return {
        // A deleted storage shows only its notice, so the plan is display-only here.
        plan: plan ?? ProjectPlanType.FREE,
        usedBytes: 0,
        limitBytes: this.limitFor(record),
        tables: [],
        deletion: null,
        deletedAt: record.deprovisionedAt,
      };
    }
    if (!plan) throw new Error('The plan of the project cannot be read');
    return this.measure(record, plan);
  }

  /** Refuses a load into a deleted, NOT_PAID or full storage; no record and an unreadable size let it go. */
  async assertCanLoad(storageId: string): Promise<void> {
    const record = await this.managedStorages.findByStorageId(storageId);
    if (!record) return;
    if (record.deprovisionedAt) {
      throw new ProjectOperationBlockedException([ProjectBlockedReason.OWOX_STORAGE_DELETED]);
    }
    const plan = await this.plans.planFor(record.projectId);
    if (!plan) {
      this.logger.warn(
        `Could not read the plan of the project for OWOX Storage ${record.datasetId}; only its size is checked.`
      );
    }
    if (plan === ProjectPlanType.NOT_PAID) {
      throw new ProjectOperationBlockedException([ProjectBlockedReason.OWOX_STORAGE_NOT_PAID]);
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

  private async measure(record: ManagedStorage, plan: ProjectPlanType): Promise<OwoxStorageUsage> {
    const tables = await this.listTables(record, false);
    const now = new Date();
    const settings = this.config.getSettings();
    const deletion = scheduledDeletion(record, plan, settings, now);
    // The rule's own idle base, so the first week after leaving NOT_PAID stays quiet.
    const idleLongEnough =
      deletion !== null &&
      now.getTime() - (deletion.date.getTime() - settings.inactivityDeletionDays * DAY_MS) >=
        IDLE_NOTICE_DAYS * DAY_MS;
    return {
      plan,
      usedBytes: sumSizes(tables),
      limitBytes: this.limitFor(record),
      tables,
      deletion: deletion?.reason === 'INACTIVE' && !idleLongEnough ? null : deletion,
      deletedAt: null,
    };
  }
}
