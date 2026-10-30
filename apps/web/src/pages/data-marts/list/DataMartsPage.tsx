import {
  DataMartListProvider,
  DataMartTable,
  useDataMartList,
} from '../../../features/data-marts/list';
import { useEffect, useMemo, useState } from 'react';
import { getDataMartColumns } from '../../../features/data-marts/list/components/DataMartTable/columns/columns.tsx';
import { ConnectorContextProvider } from '../../../features/connectors/shared/model/context';
import { useConnector } from '../../../features/connectors/shared/model/hooks/useConnector.ts';
import {
  isDataQualityActivityState,
  RunActivityIndicator,
} from '../../../features/data-marts/shared/components/RunActivityIndicator';
import { loadCustomConnectors } from '../../../features/connectors/shared/utils';
import type { ConnectorListItem } from '../../../features/connectors/shared/model/types/connector';
import { useProjectRoute } from '../../../shared/hooks';
import { useDataQualitySummaries } from '../../../features/data-marts/data-quality';

const DataMartsPageContent = () => {
  const { items, loadDataMarts, deleteDataMart, publishDataMart, refreshList, loading } =
    useDataMartList();
  const { connectors, fetchAvailableConnectors } = useConnector();
  const { navigate, projectId } = useProjectRoute();
  const [visibleDataMartIds, setVisibleDataMartIds] = useState<string[]>([]);
  const qualitySummariesQuery = useDataQualitySummaries(projectId ?? '', visibleDataMartIds);
  const hasActiveQualityRun = Object.values(qualitySummariesQuery.data ?? {}).some(summary =>
    isDataQualityActivityState(summary?.state)
  );

  useEffect(() => {
    void fetchAvailableConnectors();
  }, [fetchAvailableConnectors]);

  // The bundled list has no custom connectors; without them their Data Marts read "Unknown".
  const [customConnectors, setCustomConnectors] = useState<ConnectorListItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadCustomConnectors()
      .then(customs => {
        if (!cancelled) setCustomConnectors(customs);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);
  const allConnectors = useMemo(
    () => [...connectors, ...customConnectors],
    [connectors, customConnectors]
  );

  useEffect(() => {
    void loadDataMarts();
  }, [loadDataMarts]);

  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <div className='flex flex-wrap items-center justify-between gap-4'>
          <h1 className='dm-page-header-title'>Data Marts</h1>
          <RunActivityIndicator
            active={hasActiveQualityRun}
            label='Checking data quality'
            onViewRuns={() => {
              navigate('/data-marts/runs');
            }}
          />
        </div>
      </header>
      <div className='dm-page-content'>
        <DataMartTable
          connectors={allConnectors}
          columns={getDataMartColumns({ connectors: allConnectors })}
          data={items}
          deleteDataMart={deleteDataMart}
          publishDataMart={publishDataMart}
          refetchDataMarts={refreshList}
          onVisibleDataMartIdsChange={setVisibleDataMartIds}
          isLoading={loading}
        />
      </div>
    </div>
  );
};

export default function DataMartsPage() {
  return (
    <DataMartListProvider>
      <ConnectorContextProvider>
        <DataMartsPageContent />
      </ConnectorContextProvider>
    </DataMartListProvider>
  );
}
