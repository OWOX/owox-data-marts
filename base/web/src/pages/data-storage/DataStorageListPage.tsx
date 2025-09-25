import { DataStorageProvider } from '../../features/data-storage/shared/model/context';
import { DataStorageList } from '../../features/data-storage/list/components';
import { useState } from 'react';

export const DataStorageListPage = () => {
  const [shouldOpenDialog, setShouldOpenDialog] = useState(false);

  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Storages</h1>
      </header>

      <div className='dm-page-content'>
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
