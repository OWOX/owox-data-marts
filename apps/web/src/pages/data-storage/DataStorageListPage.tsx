import { useState, useEffect } from 'react';
import { DataStorageProvider } from '../../features/data-storage/shared/model/context';
import { DataStorageList } from '../../features/data-storage/list/components';
import { useDataStorage } from '../../features/data-storage/shared/model/hooks/useDataStorage';
import { DataStorageType } from '../../features/data-storage/shared/model/types/data-storage-type.enum';
import PageNotificationLegacyStorageSetup from '../data-marts/list/PageNotificationLegacyStorageSetup';
import {
  getCachedDataStorageHealthStatus,
  DataStorageHealthStatus,
  subscribeToDataStorageHealthStatusUpdates,
} from '../../features/data-storage/shared/services/data-storage-health-status.service';

const DataStorageListWithContext = ({
  shouldOpenDialog,
  onTypeDialogClose,
}: {
  shouldOpenDialog: boolean;
  onTypeDialogClose: () => void;
}) => {
  const { dataStorages } = useDataStorage();

  const [, setForceUpdate] = useState(0);

  useEffect(() => {
    return subscribeToDataStorageHealthStatusUpdates(() => {
      setForceUpdate(forceUpdate => forceUpdate + 1);
    });
  }, []);

  const hasLegacyStorageWithoutAccess = dataStorages.some(storage => {
    if (storage.type !== DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      return false;
    }

    const cached = getCachedDataStorageHealthStatus(storage.id);

    return cached?.status === DataStorageHealthStatus.INVALID;
  });

  return (
    <>
      {hasLegacyStorageWithoutAccess && <PageNotificationLegacyStorageSetup />}

      <DataStorageList
        initialTypeDialogOpen={shouldOpenDialog}
        onTypeDialogClose={onTypeDialogClose}
      />
    </>
  );
};

export const DataStorageListPage = () => {
  const [shouldOpenDialog, setShouldOpenDialog] = useState(false);

  return (
    <div className='dm-page' data-testid='storageListPage'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Storages</h1>
      </header>

      <div className='dm-page-content'>
        <DataStorageProvider>
          <DataStorageListWithContext
            shouldOpenDialog={shouldOpenDialog}
            onTypeDialogClose={() => {
              setShouldOpenDialog(false);
            }}
          />
        </DataStorageProvider>
      </div>
    </div>
  );
};
