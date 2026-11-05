import { Injectable, Logger } from '@nestjs/common';
import { describeGoogleError } from './engine/bigquery-managed-storage.engine';
import type { ManagedStorage } from '../entities/managed-storage.entity';
import type { ScanBudget } from '../data-storage-types/bigquery/schemas/bigquery-credentials.schema';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import { OwoxStorageConfigService } from './owox-storage-config.service';
import { OwoxStoragePlanService } from './owox-storage-plan.service';
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

/**
 * Today's scan allowance of an OWOX Storage: its daily limit minus what its account billed today
 * and what its queries running on this pod have reserved.
 */
@Injectable()
export class OwoxStorageScanBudgetService implements OwoxStorageScanBudgetFactory {
  private readonly logger = new Logger(OwoxStorageScanBudgetService.name);
  private readonly usage = new Map<string, Cached<number>>();
  private readonly inFlight = new Map<string, number>();
  // Bytes released while a usage load is running; that load's snapshot may not hold those jobs.
  private readonly releasedDuringLoad = new Map<string, number>();

  constructor(
    private readonly identity: OwoxStorageIdentity,
    private readonly config: OwoxStorageConfigService,
    private readonly plans: OwoxStoragePlanService
  ) {}

  forStorage(record: ManagedStorage): ScanBudget {
    const id = record.storageId;
    return {
      remainingBytes: async () => this.remaining(id, await this.allowance(record)),
      reserve: async estimatedBytes => {
        const remaining = this.remaining(id, await this.allowance(record));
        // No await between check and reservation, so concurrent queries cannot take the same bytes.
        if (!(estimatedBytes <= remaining)) throw OwoxStorageQueryLimitException.tooLarge();
        this.inFlight.set(id, (this.inFlight.get(id) ?? 0) + estimatedBytes);
        let released = false;
        return {
          maximumBytesBilled: remaining,
          release: () => {
            if (released) return;
            released = true;
            const left = (this.inFlight.get(id) ?? 0) - estimatedBytes;
            if (left > 0) this.inFlight.set(id, left);
            else this.inFlight.delete(id);
            // The finished job counts as used until the next usage read replaces the cached value.
            const loading = this.releasedDuringLoad.get(id);
            if (loading !== undefined) this.releasedDuringLoad.set(id, loading + estimatedBytes);
            else {
              const cached = this.usage.get(id);
              if (cached) cached.value += estimatedBytes;
            }
          },
        };
      },
    };
  }

  private async allowance(record: ManagedStorage): Promise<number> {
    return (await this.limitFor(record)) - (await this.usedToday(record));
  }

  private remaining(storageId: string, allowance: number): number {
    // BigQuery takes maximumBytesBilled as an INT64; a GiB limit like 0.1 is fractional.
    const remaining = Math.floor(allowance - (this.inFlight.get(storageId) ?? 0));
    if (!(remaining > 0)) throw new OwoxStorageQueryLimitException();
    return remaining;
  }

  private async limitFor(record: ManagedStorage): Promise<number> {
    if (record.queryLimitBytesPerDay != null) return record.queryLimitBytesPerDay;
    const settings = this.config.getSettings();
    const plan = await this.plans.planFor(record.projectId);
    return plan === ProjectPlanType.PAID
      ? settings.paidQueryLimitBytesPerDay
      : settings.freeQueryLimitBytesPerDay;
  }

  private async usedToday(record: ManagedStorage): Promise<number> {
    try {
      return await this.cached(this.usage, record.storageId, async () => {
        // A script's row already holds the bytes of its child jobs, which have rows of their own.
        const [rows] = await this.identity.bigQuery(record.gcpProjectId, record.location).query({
          query: `SELECT COALESCE(SUM(total_bytes_billed), 0) AS used
FROM \`${record.gcpProjectId}.region-${record.location.toLowerCase()}.INFORMATION_SCHEMA.JOBS_BY_PROJECT\`
WHERE user_email = @email
  AND IFNULL(statement_type, '') != 'SCRIPT'
  AND creation_time >= TIMESTAMP(CURRENT_DATE('America/Los_Angeles'), 'America/Los_Angeles')`,
          params: { email: record.serviceAccountEmail },
        });
        const used = Number(rows[0]?.used ?? 0);
        if (!Number.isFinite(used)) throw new Error(`Unexpected usage value: ${rows[0]?.used}`);
        return used;
      });
    } catch (error) {
      // Without today's usage there is no cap, so the query must not run.
      this.logger.warn(
        `Could not read today's usage of OWOX Storage ${record.storageId}: ${describeGoogleError(error)}`
      );
      throw new OwoxStorageUsageUnavailableException();
    }
  }

  private async cached(
    cache: Map<string, Cached<number>>,
    key: string,
    load: () => Promise<number>
  ): Promise<number> {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    if (!this.releasedDuringLoad.has(key)) this.releasedDuringLoad.set(key, 0);
    try {
      const value = (await load()) + (this.releasedDuringLoad.get(key) ?? 0);
      cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    } finally {
      this.releasedDuringLoad.delete(key);
    }
  }
}
