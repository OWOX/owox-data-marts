import { useEffect, useRef } from 'react';
import { DataMartRunStatus, DataMartRunType } from '../../../shared';
import type { DataMartRunItem } from '../types';

interface UseRefreshDataMartAfterConnectorRunOptions {
  dataMartId: string;
  isGoogleSheetsConnector: boolean;
  isManualRunTriggered: boolean;
  runs: DataMartRunItem[];
  refreshDataMart: (id: string) => Promise<void>;
}

export function useRefreshDataMartAfterConnectorRun({
  dataMartId,
  isGoogleSheetsConnector,
  isManualRunTriggered,
  runs,
  refreshDataMart,
}: UseRefreshDataMartAfterConnectorRunOptions): void {
  const lastObservedSuccessfulRunIdRef = useRef<string | null>(null);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (runs.length === 0 || !isGoogleSheetsConnector || !dataMartId) {
      return;
    }
    const latestSuccessfulRun = runs.find(
      run => run.type === DataMartRunType.CONNECTOR && run.status === DataMartRunStatus.SUCCESS
    );

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      if (latestSuccessfulRun && isManualRunTriggered && runs[0]?.id === latestSuccessfulRun.id) {
        lastObservedSuccessfulRunIdRef.current = latestSuccessfulRun.id;
        void refreshDataMart(dataMartId);
      } else {
        lastObservedSuccessfulRunIdRef.current = latestSuccessfulRun?.id ?? null;
      }
      return;
    }

    if (!latestSuccessfulRun || lastObservedSuccessfulRunIdRef.current === latestSuccessfulRun.id) {
      return;
    }

    lastObservedSuccessfulRunIdRef.current = latestSuccessfulRun.id;
    void refreshDataMart(dataMartId);
  }, [dataMartId, isGoogleSheetsConnector, isManualRunTriggered, refreshDataMart, runs]);
}
