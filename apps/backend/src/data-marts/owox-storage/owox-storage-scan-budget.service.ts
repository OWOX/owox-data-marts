import { Injectable, Logger } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import type { ManagedStorage } from '../entities/managed-storage.entity';
import type { ScanBudget } from '../data-storage-types/bigquery/schemas/bigquery-credentials.schema';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import { InternalProjectBillingService } from '../services/project-billing/internal-project-billing.service';
import { OwoxStorageConfigService } from './owox-storage-config.service';
import { OwoxStorageIdentity } from './owox-storage-identity.service';
import type { OwoxStorageScanBudgetFactory } from './owox-storage-scan-budget.token';
import {
  OwoxStorageQueryLimitException,
  OwoxStorageUsageUnavailableException,
} from './owox-storage.exceptions';

const CACHE_TTL_MS = 60_000;

interface Cached<T> {
  value: T;
  expiresAt: number;
}

/** Today's scan allowance of an OWOX Storage: its daily limit minus what its account billed today. */
@Injectable()
export class OwoxStorageScanBudgetService implements OwoxStorageScanBudgetFactory {
  private readonly logger = new Logger(OwoxStorageScanBudgetService.name);
  private readonly plans = new Map<string, Cached<ProjectPlanType>>();
  private readonly usage = new Map<string, Cached<number>>();

  constructor(
    private readonly identity: OwoxStorageIdentity,
    private readonly config: OwoxStorageConfigService,
    private readonly billing: InternalProjectBillingService
  ) {}

  forStorage(record: ManagedStorage): ScanBudget {
    return {
      remainingBytes: async () => {
        const remaining = (await this.limitFor(record)) - (await this.usedToday(record));
        if (remaining <= 0) throw new OwoxStorageQueryLimitException();
        return remaining;
      },
    };
  }

  private async limitFor(record: ManagedStorage): Promise<number> {
    if (record.queryLimitBytesPerDay != null) return record.queryLimitBytesPerDay;
    const settings = this.config.getSettings();
    const plan = await this.cached(this.plans, record.projectId, () => this.readPlan(record));
    return plan === ProjectPlanType.PAID
      ? settings.paidQueryLimitBytesPerDay
      : settings.freeQueryLimitBytesPerDay;
  }

  private async readPlan(record: ManagedStorage): Promise<ProjectPlanType> {
    try {
      return (await this.billing.getBalance(record.projectId)).subscriptionPlanType;
    } catch (error) {
      // A billing outage must not stop every query; the lower limit is the safe side.
      this.logger.warn(
        `Using the FREE OWOX Storage query limit for storage ${record.storageId}: ${castError(error).message}`
      );
      return ProjectPlanType.FREE;
    }
  }

  private async usedToday(record: ManagedStorage): Promise<number> {
    try {
      return await this.cached(this.usage, record.storageId, async () => {
        const [rows] = await this.identity.bigQuery(record.gcpProjectId, record.location).query({
          query: `SELECT COALESCE(SUM(total_bytes_billed), 0) AS used
FROM \`${record.gcpProjectId}.region-${record.location.toLowerCase()}.INFORMATION_SCHEMA.JOBS_BY_PROJECT\`
WHERE user_email = @email
  AND creation_time >= TIMESTAMP(CURRENT_DATE('America/Los_Angeles'), 'America/Los_Angeles')`,
          params: { email: record.serviceAccountEmail },
        });
        return Number(rows[0]?.used ?? 0);
      });
    } catch (error) {
      // Without today's usage there is no cap, so the query must not run.
      this.logger.warn(
        `Could not read today's usage of OWOX Storage ${record.storageId}: ${castError(error).message}`
      );
      throw new OwoxStorageUsageUnavailableException();
    }
  }

  private async cached<T>(
    cache: Map<string, Cached<T>>,
    key: string,
    load: () => Promise<T>
  ): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const value = await load();
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }
}
