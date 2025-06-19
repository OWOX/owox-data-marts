import {
  DataMartListProvider,
  DataMartTable,
  useDataMartList,
} from '../../../features/data-marts/list';
import { useEffect } from 'react';
import { getDataMartColumns } from '../../../features/data-marts/list/components/DataMartTable/columns.tsx';
import { Button } from '@owox/ui/components/button';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

const DataMartTableWithContext = () => {
  const { items, loadDataMarts, deleteDataMart, refreshList } = useDataMartList();

  useEffect(() => {
    void loadDataMarts();
  }, [loadDataMarts]);

  return (
    <DataMartTable
      columns={getDataMartColumns()}
      data={items}
      deleteDataMart={deleteDataMart}
      refetchDataMarts={refreshList}
    />
  );
};

export default function DataMartsPage() {
  return (
    <div>
      <header className='flex items-center justify-between px-12 pt-6 pb-4'>
        <h1 className='text-2xl font-medium'>Data Marts</h1>
        <Link to={'/data-marts/create'}>
          <Button variant='secondary' size='sm'>
            <Plus className='mr-2 h-4 w-4' />
            New Data Mart
          </Button>
        </Link>
      </header>
      <div className='px-4 sm:px-12'>
        <DataMartListProvider>
          <DataMartTableWithContext />
        </DataMartListProvider>
      </div>
    </div>
  );
}
