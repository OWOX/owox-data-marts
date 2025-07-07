import { useEffect, useState } from 'react';
import { useDataStorage } from '../../../shared/model/hooks/useDataStorage.ts';
import { DataStorageTable } from '../DataStorageTable';
import { getDataStorageColumns, type DataStorageTableItem } from '../DataStorageTable';
import { DataStorageConfigSheet } from '../../../edit';

import { DataStorageType } from '../../../shared';
import { DataStorageTypeDialog } from '../../../shared/components/DataStorageTypeDialog.tsx';
import { DataStorageDetailsDialog } from '../DataStorageDetailsDialog';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { CardSkeleton } from '../../../../../shared/components/CardSkeleton';

interface DataStorageListProps {
  initialTypeDialogOpen?: boolean;
  onTypeDialogClose?: () => void;
}

export const DataStorageList = ({
  initialTypeDialogOpen = false,
  onTypeDialogClose,
}: DataStorageListProps) => {
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(initialTypeDialogOpen);

  const {
    dataStorages,
    currentDataStorage,
    clearCurrentDataStorage,
    loading,
    fetchDataStorages,
    getDataStorageById,
    deleteDataStorage,
    createDataStorage,
  } = useDataStorage();

  useEffect(() => {
    void fetchDataStorages();
  }, [fetchDataStorages]);

  useEffect(() => {
    setIsTypeDialogOpen(initialTypeDialogOpen);
  }, [initialTypeDialogOpen]);

  const handleTypeDialogClose = () => {
    setIsTypeDialogOpen(false);
    onTypeDialogClose?.();
  };

  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [storageToDelete, setStorageToDelete] = useState<string | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedStorageId, setSelectedStorageId] = useState<string | null>(null);

  const handleCreateNewStorage = async (type: DataStorageType) => {
    try {
      const newStorage = await createDataStorage(type);
      handleTypeDialogClose();

      if (newStorage?.id) {
        await getDataStorageById(newStorage.id);
        setIsEditDrawerOpen(true);
      }
    } catch (error) {
      console.error('Failed to create storage:', error);
    }
  };

  if (loading) {
    return <CardSkeleton />;
  }

  const handleViewDetails = (id: string) => {
    setSelectedStorageId(id);
    setIsDetailsDialogOpen(true);
  };

  const handleDetailsDialogClose = () => {
    setIsDetailsDialogOpen(false);
    setSelectedStorageId(null);
  };

  const handleEdit = async (id: string) => {
    await getDataStorageById(id);
    setIsEditDrawerOpen(true);
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

  const handleSave = async () => {
    try {
      setIsEditDrawerOpen(false);
      await fetchDataStorages();
    } catch (error) {
      console.error('Failed to save storage:', error);
    }
  };

  const handleCloseDrawer = () => {
    setIsEditDrawerOpen(false);
    clearCurrentDataStorage();
  };

  const tableData: DataStorageTableItem[] = dataStorages.map(storage => ({
    id: storage.id,
    title: storage.title,
    type: storage.type,
    createdAt: storage.createdAt,
    modifiedAt: storage.modifiedAt,
  }));

  const columns = getDataStorageColumns({
    onViewDetails: handleViewDetails,
    onEdit: handleEdit,
    onDelete: handleDelete,
  });

  return (
    <div>
      <DataStorageTable
        columns={columns}
        data={tableData}
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
      />

      <DataStorageConfigSheet
        isOpen={isEditDrawerOpen}
        onClose={handleCloseDrawer}
        dataStorage={currentDataStorage}
        onSaveSuccess={() => void handleSave()}
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
    </div>
  );
};
