import type { AxiosRequestConfig } from '../../../../app/api';
import { dataMartService } from './data-mart.service';
import { mapDataMartRunListResponseDtoToEntity } from '../../edit/model/mappers/data-mart-run-mappers';
import type { DataMartRunItem } from '../../edit/model/types/data-mart-run';
import {
  filterRunsByDateRange,
  computeHealthStatusFromLatestRuns,
} from '../../list/utils/data-mart-health-status.utils';
import { DataMartHealthStatus } from '../types';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';

/**
 * Configuration constants
 */
const HEALTH_STATUS_DAYS_RANGE = 30;
const HEALTH_STATUS_PAGE_SIZE = 100;

export interface CachedHealthStatus {
  /**
   * All runs within the configured time window.
   * Used for UI (run history, hover details, etc).
   */
  recentRuns: DataMartRunItem[];

  /**
   * Aggregated health status computed ONLY
   * from the latest run of each type.
   */
  healthStatus: DataMartHealthStatus;

  /**
   * Latest run per run type.
   * Used both for UI and for health status computation.
   */
  latestRunsByType: {
    connector: DataMartRunItem | null;
    report: DataMartRunItem | null;
    insight: DataMartRunItem | null;
  };
}

/**
 * In-memory cache (session scoped)
 */
const healthStatusCache = new Map<string, CachedHealthStatus>();

/**
 * Prevents duplicate concurrent requests per Data Mart
 */
const inFlightRequests = new Set<string>();

/**
 * Simple pub/sub for cache updates
 */
const listeners = new Set<() => void>();

export function subscribeToHealthStatusUpdates(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifySubscribers() {
  listeners.forEach(listener => {
    listener();
  });
}

export function getCachedHealthStatus(dataMartId: string): CachedHealthStatus | undefined {
  return healthStatusCache.get(dataMartId);
}

/**
 * Builds CachedHealthStatus from a list of all runs.
 *
 * IMPORTANT BUSINESS LOGIC:
 * - First, we filter runs by date range.
 * - Then, we determine the latest run per type.
 * - Health status is computed ONLY from those latest runs.
 * - Historical runs do NOT affect health status.
 */
export function buildCachedHealthStatus(allRuns: readonly DataMartRunItem[]): CachedHealthStatus {
  // 1. Limit runs by time window
  const recentRuns = filterRunsByDateRange(allRuns, HEALTH_STATUS_DAYS_RANGE);

  // 2. Find latest run per type
  const latestRunsByType: CachedHealthStatus['latestRunsByType'] = {
    connector: null,
    report: null,
    insight: null,
  };

  for (const run of recentRuns) {
    switch (run.type) {
      case DataMartRunType.CONNECTOR: {
        if (!latestRunsByType.connector || run.createdAt > latestRunsByType.connector.createdAt) {
          latestRunsByType.connector = run;
        }
        break;
      }

      case DataMartRunType.INSIGHT: {
        if (!latestRunsByType.insight || run.createdAt > latestRunsByType.insight.createdAt) {
          latestRunsByType.insight = run;
        }
        break;
      }

      default: {
        if (!latestRunsByType.report || run.createdAt > latestRunsByType.report.createdAt) {
          latestRunsByType.report = run;
        }
      }
    }
  }

  // 3. Compute health status ONLY from latest runs
  const healthStatus = computeHealthStatusFromLatestRuns(latestRunsByType);

  return {
    recentRuns,
    latestRunsByType,
    healthStatus,
  };
}

/**
 * Fetches run history, builds CachedHealthStatus and stores it in cache.
 */
export async function fetchAndCacheHealthStatus(
  dataMartId: string,
  signal?: AbortSignal
): Promise<void> {
  if (healthStatusCache.has(dataMartId) || inFlightRequests.has(dataMartId)) {
    return;
  }

  inFlightRequests.add(dataMartId);

  const config: AxiosRequestConfig = {
    skipLoadingIndicator: true,
    ...(signal && { signal }),
  };

  try {
    const response = await dataMartService.getDataMartRuns(
      dataMartId,
      HEALTH_STATUS_PAGE_SIZE,
      0,
      config
    );

    const allRuns = mapDataMartRunListResponseDtoToEntity(response);
    const cachedHealthStatus = buildCachedHealthStatus(allRuns);

    healthStatusCache.set(dataMartId, cachedHealthStatus);
    notifySubscribers();
  } finally {
    inFlightRequests.delete(dataMartId);
  }
}
