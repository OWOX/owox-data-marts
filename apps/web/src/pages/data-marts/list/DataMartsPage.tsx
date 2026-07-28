import {
  DataMartListProvider,
  DataMartTable,
  useDataMartList,
} from '../../../features/data-marts/list';
import { useEffect } from 'react';
import { getDataMartColumns } from '../../../features/data-marts/list/components/DataMartTable/columns/columns.tsx';
import { ConnectorContextProvider } from '../../../features/connectors/shared/model/context';
import { useConnector } from '../../../features/connectors/shared/model/hooks/useConnector.ts';
import {
  isDataQualityActivityState,
  RunActivityIndicator,
} from '../../../features/data-marts/shared/components/RunActivityIndicator';
import { useProjectRoute } from '../../../shared/hooks';

const DataMartsPageContent = () => {
  const { items, loadDataMarts, deleteDataMart, publishDataMart, refreshList, loading } =
    useDataMartList();
  const { connectors, fetchAvailableConnectors } = useConnector();
  const { navigate } = useProjectRoute();
  const hasActiveQualityRun = items.some(item =>
    isDataQualityActivityState(item.qualitySummary.state)
  );

  useEffect(() => {
    void fetchAvailableConnectors();
  }, [fetchAvailableConnectors]);

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
          connectors={connectors}
          columns={getDataMartColumns({ connectors })}
          data={items}
          deleteDataMart={deleteDataMart}
          publishDataMart={publishDataMart}
          refetchDataMarts={refreshList}
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
