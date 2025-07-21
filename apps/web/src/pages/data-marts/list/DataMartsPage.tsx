import {
  DataMartListProvider,
  DataMartTable,
  useDataMartList,
} from '../../../features/data-marts/list';
import { useEffect } from 'react';
import { getDataMartColumns } from '../../../features/data-marts/list/components/DataMartTable/columns/columns.tsx';
import { ConnectorContextProvider } from '../../../features/connectors/shared/model/context';
import { useConnector } from '../../../features/connectors/shared/model/hooks/useConnector.ts';

const DataMartTableWithContext = () => {
  const { items, loadDataMarts, deleteDataMart, refreshList, loading } = useDataMartList();
  const { connectors, fetchAvailableConnectors } = useConnector();

  useEffect(() => {
    void fetchAvailableConnectors();
  }, [fetchAvailableConnectors]);

  useEffect(() => {
    void loadDataMarts();
  }, [loadDataMarts]);

  return (
    <DataMartTable
      columns={getDataMartColumns({ connectors })}
      data={items}
      deleteDataMart={deleteDataMart}
      refetchDataMarts={refreshList}
      isLoading={loading}
    />
  );
};

export default function DataMartsPage() {
  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Data Marts</h1>
      </header>
      <div className='dm-page-content'>
        <DataMartListProvider>
          <ConnectorContextProvider>
            <DataMartTableWithContext />
          </ConnectorContextProvider>
        </DataMartListProvider>
      </div>
    </div>
  );
}
