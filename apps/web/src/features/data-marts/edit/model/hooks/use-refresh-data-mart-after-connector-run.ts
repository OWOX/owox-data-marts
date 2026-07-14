import { useEffect, useRef } from 'react';
import { DataMartRunStatus, DataMartRunType } from '../../../shared';
import type { DataMartRunItem } from '../types';

interface UseRefreshDataMartAfterConnectorRunOptions {
  dataMartId: string;
  isConnector: boolean;
  isManualRunTriggered: boolean;
  runs: DataMartRunItem[];
  refreshDataMart: (id: string) => Promise<void>;
}

export function useRefreshDataMartAfterConnectorRun({
  dataMartId,
  isConnector,
  isManualRunTriggered,
  runs,
  refreshDataMart,
}: UseRefreshDataMartAfterConnectorRunOptions): void {
  const lastRefreshedRunIdRef = useRef<string | null>(null);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (runs.length === 0 || !isConnector || !dataMartId) {
      return;
    }
    const latestRun = runs[0];

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;

      if (!isManualRunTriggered) {
        lastRefreshedRunIdRef.current = latestRun.id;
        return;
      }
    }

    if (
      latestRun.type !== DataMartRunType.CONNECTOR ||
      latestRun.status !== DataMartRunStatus.SUCCESS ||
      lastRefreshedRunIdRef.current === latestRun.id
    ) {
      return;
    }

    lastRefreshedRunIdRef.current = latestRun.id;
    void refreshDataMart(dataMartId);
  }, [dataMartId, isConnector, isManualRunTriggered, refreshDataMart, runs]);
}
