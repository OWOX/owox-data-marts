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

// The daily run starts up to a minute late; an hour of slack keeps a due deletion from slipping a day.
const RUN_SLACK_MS = 3_600_000;

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

  private async processRecord(
    record: ManagedStorage,
    jobTimes: Map<string, Date> | null,
    days: Pick<OwoxStorageSettings, 'notPaidDeletionDays' | 'inactivityDeletionDays'>,
    now: Date
  ): Promise<void> {
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

    try {
      await this.engine.deprovision(record);
    } catch (error) {
      this.logger.error(
        `OWOX Storage ${record.datasetId} deletion failed${describeGoogleError(error)}; retried tomorrow.`
      );
      return;
    }
    if (!(await this.managedStorages.updateActive(record.storageId, { deprovisionedAt: now }))) {
      return;
    }
    this.logger.log(`OWOX Storage ${record.datasetId} deleted: ${reason}`);
  }
}
