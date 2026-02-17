import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { useUrlParam } from '../../../../../shared/hooks';
import { DataStorageConfigSheet } from '../../../edit';
import { DataStorageType } from '../../../shared';
import { DataStorageTypeDialog } from '../../../shared/components/DataStorageTypeDialog.tsx';
import { useDataStorage } from '../../../shared/model/hooks/useDataStorage.ts';
import { usePublishDraftsTrigger } from '../../../shared/hooks/usePublishDraftsTrigger.ts';
import { DataStorageDetailsDialog } from '../DataStorageDetailsDialog';
import {
  DataStorageTable,
  type DataStorageTableItem,
  getDataStorageColumns,
} from '../DataStorageTable';
import { subscribeToDataStorageHealthStatusUpdates } from '../../../shared/services/data-storage-health-status.service';

interface DataStorageListProps {
  initialTypeDialogOpen?: boolean;
  onTypeDialogClose?: () => void;
}

export const DataStorageList = ({
  initialTypeDialogOpen = false,
  onTypeDialogClose,
}: DataStorageListProps) => {
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(initialTypeDialogOpen);
  const [isCreatingDataStorage, setIsCreatingDataStorage] = useState(false);

  const {
    dataStorages,
    currentDataStorage,
    clearCurrentDataStorage,
    fetchDataStorages,
    getDataStorageById,
    deleteDataStorage,
    createDataStorage,
    loading,
  } = useDataStorage();

  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [storageToDelete, setStorageToDelete] = useState<string | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [storageToPublish, setStorageToPublish] = useState<{
    id: string;
    draftDataMartsCount: number;
  } | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedStorageId, setSelectedStorageId] = useState<string | null>(null);

  const { value: deepLinkId, setParam: setIdParam, removeParam: removeIdParam } = useUrlParam('id');
  const hasAttemptedDeepLink = useRef(false);

  useEffect(() => {
    void fetchDataStorages();
  }, [fetchDataStorages]);

  useEffect(() => {
    return subscribeToDataStorageHealthStatusUpdates(() => {
      void fetchDataStorages();
    });
  }, [fetchDataStorages]);

  const handleEdit = useCallback(
    async (id: string) => {
      await getDataStorageById(id);
      setIsEditDrawerOpen(true);

      setIdParam(id);
    },
    [getDataStorageById, setIdParam]
  );

  useEffect(() => {
    if (!loading && dataStorages.length > 0 && deepLinkId && !hasAttemptedDeepLink.current) {
      const storage = dataStorages.find(s => s.id === deepLinkId);
      if (storage) {
        void handleEdit(deepLinkId);
      } else {
        toast.error(`Storage not found by id ${deepLinkId}`);
        removeIdParam();
      }
      hasAttemptedDeepLink.current = true;
    }
  }, [loading, dataStorages, deepLinkId, removeIdParam, handleEdit]);

  useEffect(() => {
    setIsTypeDialogOpen(initialTypeDialogOpen);
  }, [initialTypeDialogOpen]);

  const handleTypeDialogClose = () => {
    setIsTypeDialogOpen(false);
    onTypeDialogClose?.();
  };

  const handleCreateNewStorage = async (type: DataStorageType) => {
    setIsCreatingDataStorage(true);
    try {
      const newStorage = await createDataStorage(type);
      handleTypeDialogClose();
      if (newStorage?.id) {
        await handleEdit(newStorage.id);
        setIsCreatingDataStorage(false);
      }
    } catch (error) {
      console.error('Failed to create storage:', error);
    }
  };

  const handleViewDetails = (id: string) => {
    setSelectedStorageId(id);
    setIsDetailsDialogOpen(true);

    setIdParam(id);
  };

  const handleDetailsDialogClose = () => {
    setIsDetailsDialogOpen(false);
    setSelectedStorageId(null);
    removeIdParam();
  };

  const handleDelete = (id: string) => {
    setStorageToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (storageToDelete) {
      try {
        await deleteDataStorage(storageToDelete);
        await fetchDataStorages();
      } catch (error) {
        console.error('Failed to delete storage:', error);
      } finally {
        setDeleteDialogOpen(false);
        setStorageToDelete(null);
      }
    }
  };

  const handlePublishDraftsRequest = (id: string): Promise<void> => {
    openPublishDraftsDialog(id);
    return Promise.resolve();
  };

  const openPublishDraftsDialog = (id: string) => {
    const storage = dataStorages.find(item => item.id === id);

    if (!storage || storage.draftDataMartsCount === 0) {
      return;
    }

    setStorageToPublish({ id: storage.id, draftDataMartsCount: storage.draftDataMartsCount });
    setPublishDialogOpen(true);
  };

  const handlePublishDraftsSuccess = useCallback(() => {
    void (async () => {
      await fetchDataStorages();
    })();
  }, [fetchDataStorages]);

  const { run: runPublishDraftsTrigger } = usePublishDraftsTrigger(handlePublishDraftsSuccess);

  const handleConfirmPublishDrafts = () => {
    if (!storageToPublish) {
      return;
    }

    const storageId = storageToPublish.id;
    setPublishDialogOpen(false);
    setStorageToPublish(null);

    void (async () => {
      await runPublishDraftsTrigger(storageId);
    })();
  };

  const handleSave = async (savedStorageId: string) => {
    try {
      setIsEditDrawerOpen(false);
      await fetchDataStorages();
      removeIdParam();
      const storage = dataStorages.find(item => item.id === savedStorageId);
      if (storage && storage.draftDataMartsCount > 0 && storage.publishedDataMartsCount === 0) {
        openPublishDraftsDialog(storage.id);
      }
    } catch (error) {
      console.error('Failed to save storage:', error);
    }
  };

  const handleCloseDrawer = () => {
    setIsEditDrawerOpen(false);
    clearCurrentDataStorage();
    removeIdParam();
  };

  const tableData: DataStorageTableItem[] = dataStorages.map(storage => ({
    id: storage.id,
    title: storage.title,
    type: storage.type,
    createdAt: storage.createdAt,
    modifiedAt: storage.modifiedAt,
    publishedDataMartsCount: storage.publishedDataMartsCount,
    draftDataMartsCount: storage.draftDataMartsCount,
  }));

  const columns = getDataStorageColumns({
    onViewDetails: handleViewDetails,
    onEdit: handleEdit,
    onDelete: handleDelete,
    onPublishDrafts: handlePublishDraftsRequest,
  });

  return (
    <div>
      <DataStorageTable
        columns={columns}
        data={tableData}
        onEdit={handleEdit}
        onOpenTypeDialog={() => {
          setIsTypeDialogOpen(true);
        }}
      />

      <DataStorageDetailsDialog
        isOpen={isDetailsDialogOpen}
        onClose={handleDetailsDialogClose}
        id={selectedStorageId ?? ''}
      />

      <DataStorageTypeDialog
        isOpen={isTypeDialogOpen}
        onClose={handleTypeDialogClose}
        onSelect={handleCreateNewStorage}
        isCreatingDataStorage={isCreatingDataStorage}
      />

      <DataStorageConfigSheet
        isOpen={isEditDrawerOpen}
        onClose={handleCloseDrawer}
        dataStorage={currentDataStorage}
        onSaveSuccess={dataStorage => void handleSave(dataStorage.id)}
      />

      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title='Delete Storage'
        description='Are you sure you want to delete this storage? This action cannot be undone.'
        confirmLabel='Delete'
        cancelLabel='Cancel'
        onConfirm={() => {
          void handleConfirmDelete();
        }}
        onCancel={() => {
          setStorageToDelete(null);
        }}
        variant='destructive'
      />

      <ConfirmationDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        title='Publish drafts'
        description={
          <span>
            There are <strong>{String(storageToPublish?.draftDataMartsCount ?? 0)}</strong> data
            mart draft
            {storageToPublish?.draftDataMartsCount === 1 ? '' : 's'} available. We can publish them
            now. Continue?
          </span>
        }
        confirmLabel='Publish'
        cancelLabel='Not now'
        onConfirm={() => {
          handleConfirmPublishDrafts();
        }}
        onCancel={() => {
          setStorageToPublish(null);
        }}
        variant='brand'
      />
    </div>
  );
};
