import { useCallback, useEffect, useState } from 'react';
import type { CachedDataStorageHealthStatus } from '../../services/data-storage-health-status.service';
import {
  DataStorageHealthStatus,
  fetchAndCacheDataStorageHealthStatus,
  getCachedDataStorageHealthStatus,
  subscribeToDataStorageHealthStatusUpdates,
} from '../../services/data-storage-health-status.service';

export interface UseDataStorageHealthStatusReturn {
  status: DataStorageHealthStatus;
  errorMessage?: string;
  reason?: Record<string, unknown>;
  isLoading: boolean;
  isFetched: boolean;
}

export function useDataStorageHealthStatus(storageId: string): UseDataStorageHealthStatusReturn {
  const [cached, setCached] = useState<CachedDataStorageHealthStatus | null>(() => {
    return getCachedDataStorageHealthStatus(storageId) ?? null;
  });

  const readCached = useCallback(() => {
    return getCachedDataStorageHealthStatus(storageId) ?? null;
  }, [storageId]);

  // Subscribe to cache updates; re-fetch when cache is invalidated
  useEffect(() => {
    return subscribeToDataStorageHealthStatusUpdates(() => {
      const next = readCached();
      setCached(prev => (prev === next ? prev : next));

      // If cache was invalidated (entry removed), trigger a fresh fetch
      if (!next) {
        fetchAndCacheDataStorageHealthStatus(storageId);
      }
    });
  }, [readCached, storageId]);

  // Reset state on storageId change
  useEffect(() => {
    const next = readCached();
    setCached(prev => (prev === next ? prev : next));
  }, [readCached]);

  // Auto-fetch on mount / storageId change
  useEffect(() => {
    fetchAndCacheDataStorageHealthStatus(storageId);
  }, [storageId]);

  const isFetched = Boolean(cached);

  return {
    status: cached?.status ?? DataStorageHealthStatus.INVALID,
    errorMessage: cached?.errorMessage,
    isLoading: !isFetched,
    isFetched,
  };
}
