import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ManagedStorage } from '../entities/managed-storage.entity';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import { describeGoogleError } from './engine/bigquery-managed-storage.engine';
import { MANAGED_STORAGE_ENGINE, ManagedStorageEngine } from './engine/managed-storage-engine';
import { ManagedStorageService } from './managed-storage.service';
import { OwoxStorageConfigService } from './owox-storage-config.service';
import { scheduledDeletion } from './owox-storage-lifecycle';
import { OwoxStoragePlanService } from './owox-storage-plan.service';

const DAY_MS = 86_400_000;

@Injectable()
export class OwoxStorageLifecycleService {
  private readonly logger = new Logger(OwoxStorageLifecycleService.name);

  constructor(
    @Inject(MANAGED_STORAGE_ENGINE) private readonly engine: ManagedStorageEngine,
    private readonly plans: OwoxStoragePlanService,
    private readonly managedStorages: ManagedStorageService,
    private readonly config: OwoxStorageConfigService
  ) {}

  async runDaily(now: Date, signal?: AbortSignal): Promise<void> {
    if (!this.config.isEnabled()) return;
    const days = this.config.getSettings();
    const records = await this.managedStorages.findActive();
    if (records.length === 0) return;

    let jobTimes: Map<string, Date> | null = null;
    try {
      const since = new Date(now.getTime() - days.inactivityDeletionDays * DAY_MS);
      jobTimes = await this.engine.lastJobTimes(records, since);
    } catch (error) {
      this.logger.warn(
        `Could not read OWOX Storage activity${describeGoogleError(error)}; no storage is deleted for inactivity today.`
      );
    }

    for (const record of records) {
      if (signal?.aborted) return;
      try {
        await this.processRecord(record, jobTimes, days, now);
      } catch (error) {
        this.logger.error(
          `OWOX Storage ${record.datasetId} lifecycle step failed${describeGoogleError(error)}`
        );
      }
    }
  }

  private async processRecord(
    record: ManagedStorage,
    jobTimes: Map<string, Date> | null,
    days: { notPaidDeletionDays: number; inactivityDeletionDays: number },
    now: Date
  ): Promise<void> {
    const plan = await this.plans.planFor(record.projectId);
    if (!plan) {
      this.logger.warn(
        `Could not read the plan of the project for OWOX Storage ${record.datasetId}; skipped today.`
      );
      return;
    }

    const before = [record.notPaidSince, record.lastActivityAt].map(d => d?.getTime() ?? null);
    const jobTime = jobTimes?.get(record.serviceAccountEmail);
    if (jobTime && (!record.lastActivityAt || jobTime > record.lastActivityAt)) {
      record.lastActivityAt = jobTime;
    }

    let deletable = false;
    if (plan === ProjectPlanType.NOT_PAID) {
      if (!record.notPaidSince) record.notPaidSince = now;
      else deletable = true;
    } else if (record.notPaidSince) {
      record.notPaidSince = null;
      record.lastActivityAt = now;
    } else {
      deletable = plan === ProjectPlanType.FREE && jobTimes !== null;
    }

    const due = deletable ? scheduledDeletion(record, plan, days, now) : null;
    const reason = due && due.date <= now ? due.reason : null;

    const after = [record.notPaidSince, record.lastActivityAt].map(d => d?.getTime() ?? null);
    if (before.some((value, i) => value !== after[i])) await this.managedStorages.save(record);
    if (!reason) return;

    try {
      await this.engine.deprovision(record);
    } catch (error) {
      this.logger.error(
        `OWOX Storage ${record.datasetId} deletion failed${describeGoogleError(error)}; retried tomorrow.`
      );
      return;
    }
    record.deprovisionedAt = now;
    await this.managedStorages.save(record);
    this.logger.log(`OWOX Storage ${record.datasetId} deleted: ${reason}`);
  }
}
