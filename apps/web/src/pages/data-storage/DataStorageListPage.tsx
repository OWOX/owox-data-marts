import { DataStorageProvider } from '../../features/data-storage/shared/model/context';
import { DataStorageList } from '../../features/data-storage/list/components';
import { Button } from '@owox/ui/components/button';
import { Plus } from 'lucide-react';
import { useState } from 'react';

export const DataStorageListPage = () => {
  const [shouldOpenDialog, setShouldOpenDialog] = useState(false);

  return (
    <div>
      <header className='flex items-center justify-between px-12 pt-6 pb-4'>
        <h1 className='text-2xl font-medium'>Data Storages</h1>
        <Button
          variant='secondary'
          size='sm'
          onClick={() => {
            setShouldOpenDialog(true);
          }}
        >
          <Plus className='mr-2 h-4 w-4' />
          New Data Storage
        </Button>
      </header>

      <div className='px-4 sm:px-12'>
        <DataStorageProvider>
          <DataStorageList
            initialTypeDialogOpen={shouldOpenDialog}
            onTypeDialogClose={() => {
              setShouldOpenDialog(false);
            }}
          />
        </DataStorageProvider>
      </div>
    </div>
  );
};
