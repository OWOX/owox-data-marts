import type { AxiosRequestConfig } from '../../../../app/api';
import {
  dataStorageApiService,
  type DataStorageValidationCode,
} from '../api/data-storage-api.service';

/**
 * Health status for a data storage.
 */
export enum DataStorageHealthStatus {
  VALID = 'valid',
  INVALID = 'invalid',
  UNCONFIGURED = 'unconfigured',
}

/**
 * Must match ValidationResultCode.UNCONFIGURED on the backend.
 * If the backend enum value changes, update this constant accordingly.
 */
const UNCONFIGURED_CODE: DataStorageValidationCode = 'UNCONFIGURED';

export const HEALTH_STATUS_UNCONFIGURED_TEXT = 'Complete setup to activate Storage';

export interface CachedDataStorageHealthStatus {
  status: DataStorageHealthStatus;
  errorMessage?: string;
}

/**
 * Maximum number of concurrent validation requests.
 */
const MAX_CONCURRENT_REQUESTS = 5;

/**
 * In-memory cache (session scoped)
 */
const healthStatusCache = new Map<string, CachedDataStorageHealthStatus>();

/**
 * Prevents duplicate concurrent requests per Data Storage
 */
const inFlightRequests = new Set<string>();

/**
 * Queue of pending storage IDs waiting to be fetched
 */
const pendingQueue: string[] = [];

/**
 * Number of currently active requests
 */
let activeRequestCount = 0;

/**
 * Simple pub/sub for cache updates
 */
const listeners = new Set<() => void>();

export function subscribeToDataStorageHealthStatusUpdates(listener: () => void) {
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

export function getCachedDataStorageHealthStatus(
  storageId: string
): CachedDataStorageHealthStatus | undefined {
  return healthStatusCache.get(storageId);
}

/**
 * Invalidates cached health status for a specific storage.
 * After invalidation, the next render of DataStorageHealthIndicator
 * will trigger a fresh validation request.
 */
export function invalidateDataStorageHealthStatus(storageId: string): void {
  healthStatusCache.delete(storageId);
  notifySubscribers();
}

/**
 * Processes the next items in the pending queue, respecting concurrency limit.
 */
function processQueue(): void {
  while (activeRequestCount < MAX_CONCURRENT_REQUESTS && pendingQueue.length > 0) {
    const storageId = pendingQueue.shift();

    if (!storageId) {
      break;
    }

    if (healthStatusCache.has(storageId) || inFlightRequests.has(storageId)) {
      continue;
    }

    inFlightRequests.add(storageId);
    activeRequestCount++;

    const config: AxiosRequestConfig = {
      skipLoadingIndicator: true,
    };

    dataStorageApiService
      .validateAccess(storageId, config)
      .then(response => {
        let status: DataStorageHealthStatus;
        if (response.valid) {
          status = DataStorageHealthStatus.VALID;
        } else if (response.code === UNCONFIGURED_CODE) {
          status = DataStorageHealthStatus.UNCONFIGURED;
        } else {
          status = DataStorageHealthStatus.INVALID;
        }

        const cached: CachedDataStorageHealthStatus = {
          status,
          errorMessage: response.errorMessage,
        };

        healthStatusCache.set(storageId, cached);
        notifySubscribers();
      })
      .catch(() => {
        // Silently ignore errors — the item stays uncached and can be retried
      })
      .finally(() => {
        inFlightRequests.delete(storageId);
        activeRequestCount--;
        processQueue();
      });
  }
}

/**
 * Enqueues a storage ID for health status fetching.
 * Respects concurrency limit of MAX_CONCURRENT_REQUESTS.
 */
export function fetchAndCacheDataStorageHealthStatus(storageId: string): void {
  if (healthStatusCache.has(storageId) || inFlightRequests.has(storageId)) {
    return;
  }

  if (!pendingQueue.includes(storageId)) {
    pendingQueue.push(storageId);
  }

  processQueue();
}
