import type { AxiosRequestConfig } from '../../../../app/api';
import type { DataMartRunItem } from '../../edit';
import { mapDataMartRunResponseDtoToEntity } from '../../edit/model/mappers';
import { computeHealthStatusFromLatestRuns } from '../../list';
import { DataMartHealthStatus } from '../types';
import { dataMartService } from './data-mart.service';

export interface CachedHealthStatus {
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
 * Fetches run history, builds CachedHealthStatus and stores it in cache.
 * Leverages the batch endpoint under the hood for consistency.
 */
export async function fetchAndCacheHealthStatus(
  dataMartId: string,
  signal?: AbortSignal
): Promise<void> {
  await fetchAndCacheBatchHealthStatus([dataMartId], signal);
}

/**
 * Fetches batch run history, builds CachedHealthStatus and stores it in cache.
 */
export async function fetchAndCacheBatchHealthStatus(
  dataMartIds: string[],
  signal?: AbortSignal
): Promise<void> {
  const idsToFetch = dataMartIds.filter(
    id => !healthStatusCache.has(id) && !inFlightRequests.has(id)
  );

  if (!idsToFetch.length) {
    return;
  }

  for (const id of idsToFetch) {
    inFlightRequests.add(id);
  }

  const config: AxiosRequestConfig = {
    skipLoadingIndicator: true,
    ...(signal && { signal }),
  };

  try {
    const response = await dataMartService.getBatchDataMartHealthStatus(idsToFetch, config);

    for (const item of response.items) {
      const latestRunsByType: CachedHealthStatus['latestRunsByType'] = {
        connector: item.connector ? mapDataMartRunResponseDtoToEntity(item.connector) : null,
        report: item.report ? mapDataMartRunResponseDtoToEntity(item.report) : null,
        insight: item.insight ? mapDataMartRunResponseDtoToEntity(item.insight) : null,
      };

      const healthStatus = computeHealthStatusFromLatestRuns(latestRunsByType);

      const cachedHealthStatus: CachedHealthStatus = {
        latestRunsByType,
        healthStatus,
      };

      healthStatusCache.set(item.dataMartId, cachedHealthStatus);
    }
    notifySubscribers();
  } finally {
    for (const id of idsToFetch) {
      inFlightRequests.delete(id);
    }
  }
}
