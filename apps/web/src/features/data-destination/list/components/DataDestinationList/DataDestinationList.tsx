import { useCallback, useEffect, useState } from 'react';
import { useDataDestination } from '../../../shared';
import { DataDestinationTable } from '../DataDestinationTable';
import { getDataDestinationColumns, type DataDestinationTableItem } from '../DataDestinationTable';
import { DataDestinationConfigSheet } from '../../../edit';
import { DataDestinationDetailsDialog } from '../DataDestinationDetailsDialog';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';

interface DataDestinationListProps {
  isCreateSheetInitiallyOpen?: boolean;
  onCreateSheetClose?: () => void;
}

export const DataDestinationList = ({
  isCreateSheetInitiallyOpen = false,
  onCreateSheetClose,
}: DataDestinationListProps) => {
  const {
    dataDestinations,
    currentDataDestination,
    clearCurrentDataDestination,
    fetchDataDestinations,
    getDataDestinationById,
    deleteDataDestination,
  } = useDataDestination();

  const handleOpenCreateForm = useCallback(() => {
    clearCurrentDataDestination();
    setIsEditSheetOpen(true);
    onCreateSheetClose?.();
  }, [clearCurrentDataDestination, onCreateSheetClose]);

  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [destinationToDelete, setDestinationToDelete] = useState<string | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);

  useEffect(() => {
    void fetchDataDestinations();
  }, [fetchDataDestinations]);

  useEffect(() => {
    if (isCreateSheetInitiallyOpen) {
      handleOpenCreateForm();
    }
  }, [isCreateSheetInitiallyOpen, handleOpenCreateForm]);

  const handleViewDetails = (id: string) => {
    setSelectedDestinationId(id);
    setIsDetailsDialogOpen(true);
  };

  const handleDetailsDialogClose = () => {
    setIsDetailsDialogOpen(false);
    setSelectedDestinationId(null);
  };

  const handleEdit = async (id: string) => {
    await getDataDestinationById(id);
    setIsEditSheetOpen(true);
  };

  const handleDelete = (id: string) => {
    setDestinationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (destinationToDelete) {
      try {
        await deleteDataDestination(destinationToDelete);
        await fetchDataDestinations();
      } catch (error) {
        console.error('Failed to delete data destination:', error);
      } finally {
        setDeleteDialogOpen(false);
        setDestinationToDelete(null);
      }
    }
  };

  const handleSave = async () => {
    try {
      setIsEditSheetOpen(false);
      await fetchDataDestinations();
    } catch (error) {
      console.error('Failed to save data destination:', error);
    }
  };

  const handleCloseSheet = () => {
    setIsEditSheetOpen(false);
    clearCurrentDataDestination();
  };

  const tableData: DataDestinationTableItem[] = dataDestinations.map(destination => ({
    id: destination.id,
    title: destination.title,
    type: destination.type,
    createdAt: destination.createdAt,
    modifiedAt: destination.modifiedAt,
  }));

  const columns = getDataDestinationColumns({
    onViewDetails: handleViewDetails,
    onEdit: handleEdit,
    onDelete: handleDelete,
  });

  return (
    <div>
      <DataDestinationTable columns={columns} data={tableData} />

      <DataDestinationDetailsDialog
        isOpen={isDetailsDialogOpen}
        onClose={handleDetailsDialogClose}
        id={selectedDestinationId ?? ''}
      />

      <DataDestinationConfigSheet
        isOpen={isEditSheetOpen}
        onClose={handleCloseSheet}
        dataDestination={currentDataDestination}
        onSaveSuccess={() => void handleSave()}
      />

      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title='Delete Data Destination'
        description='Are you sure you want to delete this data destination? This action cannot be undone.'
        confirmLabel='Delete'
        cancelLabel='Cancel'
        onConfirm={() => {
          void handleConfirmDelete();
        }}
        onCancel={() => {
          setDestinationToDelete(null);
        }}
        variant='destructive'
      />
    </div>
  );
};
