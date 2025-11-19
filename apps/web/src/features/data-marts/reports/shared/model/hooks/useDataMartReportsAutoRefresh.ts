import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../../edit/model/context/types';
import { useReport } from './useReport';
import { useAutoRefresh } from '../../../../../../hooks/useAutoRefresh';

interface Options {
  enabled?: boolean;
  intervalMs?: number;
}

/**
 * Centralized auto-refresh for Data Mart reports.
 * Call once on the Data Mart page to ensure a single polling cycle per dataMart.id.
 */
export function useDataMartReportsAutoRefresh({ enabled = true, intervalMs = 5000 }: Options = {}) {
  const { dataMart } = useOutletContext<DataMartContextType>();
  const { fetchReportsByDataMartId } = useReport();

  // Initial fetch on dataMart change
  useEffect(() => {
    if (!dataMart) return;
    void fetchReportsByDataMartId(dataMart.id);
  }, [dataMart?.id, fetchReportsByDataMartId]);

  // Unified polling for the current dataMart
  useAutoRefresh({
    enabled: !!dataMart && enabled,
    intervalMs,
    onTick: () => {
      if (!dataMart) return;
      void fetchReportsByDataMartId(dataMart.id, { silent: true });
    },
  });
}
