import { useCallback, useEffect, useState } from 'react';
import type { CachedHealthStatus } from '../../../shared/services/data-mart-health-status.service';
import {
  fetchAndCacheHealthStatus,
  getCachedHealthStatus,
  subscribeToHealthStatusUpdates,
} from '../../../shared/services/data-mart-health-status.service';
import { DataMartHealthStatus } from '../../../shared/types';

export interface UseDataMartHealthStatusReturn {
  healthStatus: CachedHealthStatus['healthStatus'];
  latestRunsByType: CachedHealthStatus['latestRunsByType'];
  isLoading: boolean;
  isFetched: boolean;
  error: Error | null;
  prefetch: () => Promise<void>;
}

export function useDataMartHealthStatus(dataMartId: string): UseDataMartHealthStatusReturn {
  const [cachedHealthStatus, setCachedHealthStatus] = useState<CachedHealthStatus | null>(() => {
    return getCachedHealthStatus(dataMartId) ?? null;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const readCachedHealthStatus = useCallback(() => {
    return getCachedHealthStatus(dataMartId) ?? null;
  }, [dataMartId]);

  useEffect(() => {
    return subscribeToHealthStatusUpdates(() => {
      const next = readCachedHealthStatus();

      setCachedHealthStatus(prev => (prev === next ? prev : next));
    });
  }, [readCachedHealthStatus]);

  useEffect(() => {
    const next = readCachedHealthStatus();
    setCachedHealthStatus(prev => (prev === next ? prev : next));
    setIsLoading(false);
    setError(null);
  }, [readCachedHealthStatus]);

  const fetch = useCallback(async () => {
    if (readCachedHealthStatus()) return;

    setIsLoading(true);
    setError(null);

    try {
      await fetchAndCacheHealthStatus(dataMartId);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load health status'));
    } finally {
      setIsLoading(false);
    }
  }, [dataMartId, readCachedHealthStatus]);

  const prefetch = useCallback(async () => {
    if (readCachedHealthStatus()) return;
    await fetch();
  }, [fetch, readCachedHealthStatus]);

  return {
    healthStatus: cachedHealthStatus?.healthStatus ?? DataMartHealthStatus.NO_RUNS,
    latestRunsByType: cachedHealthStatus?.latestRunsByType ?? {
      connector: null,
      report: null,
      insight: null,
    },
    isLoading,
    isFetched: Boolean(cachedHealthStatus),
    error,
    prefetch,
  };
}
