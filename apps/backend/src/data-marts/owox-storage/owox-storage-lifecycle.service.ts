import { Inject, Injectable, Logger } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import type { ManagedStorage } from '../entities/managed-storage.entity';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import { describeGoogleError } from './engine/bigquery-managed-storage.engine';
import { MANAGED_STORAGE_ENGINE, ManagedStorageEngine } from './engine/managed-storage-engine';
import { ManagedStorageService } from './managed-storage.service';
import { OwoxStorageConfigService } from './owox-storage-config.service';
import { DAY_MS, scheduledDeletion } from './owox-storage-lifecycle';
import type { OwoxStorageSettings } from './owox-storage-settings';
import { OwoxStoragePlanService } from './owox-storage-plan.service';

// One hour for a DST shift of the scheduler's time zone, one for the run's start delay.
const RUN_SLACK_MS = 2 * 3_600_000;

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

    const records = await this.managedStorages.findActive();
    if (records.length === 0) return;

    if (signal?.aborted) return;
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
          `OWOX Storage ${record.datasetId} lifecycle step failed (${castError(error).name})${describeGoogleError(error)}`
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

  private async processRecord(
    snapshot: ManagedStorage,
    jobTimes: Map<string, Date> | null,
    days: Pick<OwoxStorageSettings, 'notPaidDeletionDays' | 'inactivityDeletionDays'>,
    now: Date
  ): Promise<void> {
    // The snapshot can be stale: a restore or a delete may have run since.
    const record = await this.managedStorages.findByStorageId(snapshot.storageId);
    if (!record || record.deprovisionedAt) return;

    const plan = await this.plans.planFor(record.projectId);
    if (!plan) {
      this.logger.warn(
        `Could not read the plan of the project for OWOX Storage ${record.datasetId}; skipped today.`
      );
      return;
    }

    const changes: Partial<Pick<ManagedStorage, 'notPaidSince' | 'lastActivityAt'>> = {};
    const jobTime = jobTimes?.get(record.serviceAccountEmail);
    if (jobTime && (!record.lastActivityAt || jobTime > record.lastActivityAt)) {
      changes.lastActivityAt = jobTime;
    }

    let deletable = false;
    if (plan === ProjectPlanType.NOT_PAID) {
      if (!record.notPaidSince) changes.notPaidSince = now;
      else deletable = true;
    } else if (record.notPaidSince || plan === ProjectPlanType.PAID) {
      // Leaving NOT_PAID or PAID gives a FREE project its full inactivity period.
      if (record.notPaidSince) changes.notPaidSince = null;
      changes.lastActivityAt = now;
    } else {
      deletable = plan === ProjectPlanType.FREE && jobTimes !== null;
    }

    const due = deletable ? scheduledDeletion({ ...record, ...changes }, plan, days, now) : null;
    const reason = due && due.date.getTime() <= now.getTime() + RUN_SLACK_MS ? due.reason : null;

    if (
      Object.keys(changes).length > 0 &&
      !(await this.managedStorages.updateActive(record.storageId, changes))
    ) {
      return;
    }
    if (!reason) return;
    // An inactivity decision stands only while no use was recorded since it was made.
    const marked =
      reason === 'INACTIVE'
        ? await this.managedStorages.markDeleting(
            record.storageId,
            now,
            changes.lastActivityAt ?? record.lastActivityAt ?? null
          )
        : await this.managedStorages.markDeleting(record.storageId, now);
    if (!marked) return;

    try {
      await this.engine.deprovision(record);
    } catch (error) {
      this.logger.error(
        `OWOX Storage ${record.datasetId} deletion failed${describeGoogleError(error)}; retried at the next run.`
      );
      return;
    }
    await this.managedStorages.setDeprovisionPending(record.storageId, false);
    this.logger.log(`OWOX Storage ${record.datasetId} deleted: ${reason}`);
  }
}
