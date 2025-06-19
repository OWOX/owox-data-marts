import {
  DataMartListProvider,
  DataMartTable,
  useDataMartList,
} from '../../../features/data-marts/list';
import { useEffect } from 'react';
import { getDataMartColumns } from '../../../features/data-marts/list/components/DataMartTable/columns.tsx';

const DataMartTableWithContext = () => {
  const { items, loadDataMarts } = useDataMartList();

  useEffect(() => {
    void loadDataMarts();
  }, [loadDataMarts]);

  return <DataMartTable columns={getDataMartColumns()} data={items} />;
};

export default function DataMartsPage() {
  return (
    <div>
      <header className='px-12 pt-6 pb-4'>
        <h1 className='text-2xl font-medium'>Data Marts</h1>
      </header>
      <div className='px-4 sm:px-12'>
        <DataMartListProvider>
          <DataMartTableWithContext />
        </DataMartListProvider>
      </div>
    </div>
  );
}
