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
  REAUTH_REQUIRED = 'reauth_required',
}

/**
 * Must match ValidationResultCode values on the backend.
 * If backend enum values change, update these constants accordingly.
 */
const UNCONFIGURED_CODE: DataStorageValidationCode = 'UNCONFIGURED';
const OAUTH_REAUTH_REQUIRED_CODE: DataStorageValidationCode = 'OAUTH_REAUTH_REQUIRED';

export const UNCONFIGURED_STATUS_LABEL = 'Complete setup to activate Storage';
export const OAUTH_REAUTH_REQUIRED_STATUS_LABEL =
  'Google authorization could not be refreshed. Reconnect this Storage to restore access.';

export interface CachedDataStorageHealthStatus {
  status: DataStorageHealthStatus;
  errorMessage?: string;
}

interface PendingHealthStatusRequest {
  storageId: string;
  force: boolean;
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
const pendingQueue: PendingHealthStatusRequest[] = [];

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
    const request = pendingQueue.shift();

    if (!request) {
      break;
    }

    const { storageId, force } = request;

    if ((!force && healthStatusCache.has(storageId)) || inFlightRequests.has(storageId)) {
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
        } else if (response.code === OAUTH_REAUTH_REQUIRED_CODE) {
          status = DataStorageHealthStatus.REAUTH_REQUIRED;
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
      .catch((error: unknown) => {
        console.error(`[DataStorageHealthStatus] Failed to validate storage ${storageId}:`, error);
        healthStatusCache.set(storageId, {
          status: DataStorageHealthStatus.INVALID,
          errorMessage: 'Unable to validate storage access',
        });
        notifySubscribers();
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
export function fetchAndCacheDataStorageHealthStatus(
  storageId: string,
  options: { force?: boolean } = {}
): void {
  const force = options.force ?? false;

  if ((!force && healthStatusCache.has(storageId)) || inFlightRequests.has(storageId)) {
    return;
  }

  const queuedRequest = pendingQueue.find(request => request.storageId === storageId);
  if (queuedRequest) {
    queuedRequest.force ||= force;
  } else {
    pendingQueue.push({ storageId, force });
  }

  processQueue();
}
