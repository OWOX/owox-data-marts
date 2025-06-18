import { useEffect, useState } from 'react';
import { useDataStorage } from '../../../shared/model/hooks/useDataStorage.ts';
import { DataStorageTable } from '../DataStorageTable';
import { getDataStorageColumns, type DataStorageTableItem } from '../DataStorageTable';
import { DataStorageConfigDrawer } from '../../../edit';
import type { DataStorageFormData } from '../../../shared/types/data-storage.schema.ts';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@owox/ui/components/dialog';
import { Button } from '@owox/ui/components/button';
import { DataStorageType } from '../../../shared';
import { DataStorageTypeDialog } from '../../../shared/components/DataStorageTypeDialog.tsx';
import { DataStorageDetailsDialog } from '../DataStorageDetailsDialog';

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
    error,
    fetchDataStorages,
    getDataStorageById,
    updateDataStorage,
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
      console.error('Failed to create data storage:', error);
    }
  };

  useEffect(() => {
    void fetchDataStorages();
  }, [fetchDataStorages]);

  if (loading) {
    return <div className='py-4'>Loading data storages...</div>;
  }

  if (error) {
    return <div className='py-4 text-red-500'>Error: {error}</div>;
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
        console.error('Failed to delete data storage:', error);
      } finally {
        setDeleteDialogOpen(false);
        setStorageToDelete(null);
      }
    }
  };

  const handleSave = async (data: DataStorageFormData) => {
    try {
      if (currentDataStorage) {
        await updateDataStorage(currentDataStorage.id, data);
        setIsEditDrawerOpen(false);
        await fetchDataStorages();
      }
    } catch (error) {
      console.error('Failed to save data storage:', error);
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
      <DataStorageTable columns={columns} data={tableData} />

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

      <DataStorageConfigDrawer
        isOpen={isEditDrawerOpen}
        onClose={handleCloseDrawer}
        dataStorage={currentDataStorage}
        onSave={handleSave}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Data Storage</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this data storage? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='secondary'
              onClick={() => {
                setDeleteDialogOpen(false);
                setStorageToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button variant='destructive' onClick={() => void handleConfirmDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
