import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { useUrlParam } from '../../../../../shared/hooks';
import { DataDestinationConfigSheet } from '../../../edit';
import { generateLookerStudioJsonConfig, useDataDestination } from '../../../shared';
import { isLookerStudioCredentials } from '../../../shared/model/types/looker-studio-credentials.ts';
import {
  DataDestinationTable,
  type DataDestinationTableItem,
  getDataDestinationColumns,
} from '../DataDestinationTable';

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
    rotateSecretKey,
    loading,
  } = useDataDestination();

  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isRotateSecretKeyDialogOpen, setRotateSecretKeyDialogOpen] = useState(false);
  const [destinationToDelete, setDestinationToDelete] = useState<string | null>(null);
  const [destinationToRotateSecretKey, setDestinationToRotateSecretKey] = useState<string | null>(
    null
  );

  const { value: deepLinkId, setParam: setIdParam, removeParam: removeIdParam } = useUrlParam('id');
  const hasAttemptedDeepLink = useRef(false);

  const handleEdit = useCallback(
    async (id: string) => {
      await getDataDestinationById(id);
      setIsEditSheetOpen(true);
      setIdParam(id);
    },
    [getDataDestinationById, setIdParam]
  );

  const handleOpenCreateForm = useCallback(() => {
    clearCurrentDataDestination();
    setIsEditSheetOpen(true);
    onCreateSheetClose?.();
    removeIdParam();
  }, [clearCurrentDataDestination, onCreateSheetClose, removeIdParam]);

  useEffect(() => {
    if (!loading && dataDestinations.length > 0 && deepLinkId && !hasAttemptedDeepLink.current) {
      const destination = dataDestinations.find(d => d.id === deepLinkId);
      if (destination) {
        void handleEdit(deepLinkId);
      } else {
        toast.error(`Destination not found by id ${deepLinkId}`);
        removeIdParam();
      }
      hasAttemptedDeepLink.current = true;
    }
  }, [loading, dataDestinations, deepLinkId, removeIdParam, handleEdit]);

  useEffect(() => {
    void fetchDataDestinations();
  }, [fetchDataDestinations]);

  useEffect(() => {
    if (isCreateSheetInitiallyOpen) {
      handleOpenCreateForm();
    }
  }, [isCreateSheetInitiallyOpen, handleOpenCreateForm]);

  const handleDelete = (id: string) => {
    setDestinationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleRotateSecretKey = (id: string) => {
    setDestinationToRotateSecretKey(id);
    setRotateSecretKeyDialogOpen(true);
  };

  const handleConfirmRotateSecretKey = async () => {
    if (destinationToRotateSecretKey) {
      try {
        const updatedDestination = await rotateSecretKey(destinationToRotateSecretKey);
        if (isLookerStudioCredentials(updatedDestination.credentials)) {
          toast.success('New JSON Config copied to clipboard');
          const jsonConfig = generateLookerStudioJsonConfig(updatedDestination.credentials);
          void navigator.clipboard.writeText(jsonConfig);
        }
        await fetchDataDestinations();
      } catch (error) {
        console.error('Failed to rotate secret key:', error);
      } finally {
        setRotateSecretKeyDialogOpen(false);
        setDestinationToRotateSecretKey(null);
      }
    }
  };

  const handleConfirmDelete = async () => {
    if (destinationToDelete) {
      try {
        await deleteDataDestination(destinationToDelete);
        await fetchDataDestinations();
      } catch (error) {
        console.error('Failed to delete destination:', error);
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
      removeIdParam();
    } catch (error) {
      console.error('Failed to save destination:', error);
    }
  };

  const handleCloseSheet = () => {
    setIsEditSheetOpen(false);
    clearCurrentDataDestination();
    removeIdParam();
  };

  const tableData: DataDestinationTableItem[] = dataDestinations.map(destination => ({
    id: destination.id,
    title: destination.title,
    type: destination.type,
    createdAt: destination.createdAt,
    modifiedAt: destination.modifiedAt,
    credentials: destination.credentials,
  }));

  const columns = getDataDestinationColumns({
    onEdit: handleEdit,
    onDelete: handleDelete,
    onRotateSecretKey: handleRotateSecretKey,
  });

  return (
    <div>
      <DataDestinationTable
        columns={columns}
        data={tableData}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onRotateSecretKey={handleRotateSecretKey}
        onOpenTypeDialog={handleOpenCreateForm}
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
        title='Delete Destination'
        description='Are you sure you want to delete this  destination? This action cannot be undone.'
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

      <ConfirmationDialog
        open={isRotateSecretKeyDialogOpen}
        onOpenChange={setRotateSecretKeyDialogOpen}
        title='Rotate Secret Key'
        description={'Rotating the secret key will invalidate the previous key'}
        confirmLabel='Rotate Key'
        cancelLabel='Cancel'
        onConfirm={() => void handleConfirmRotateSecretKey()}
        onCancel={() => {
          setRotateSecretKeyDialogOpen(false);
        }}
        variant='destructive'
      >
        <div className='text-sm'>
          <p className='mb-2'>After rotation, you will need to:</p>
          <ol className='mb-2 list-decimal pl-5'>
            <li>The new JSON Config will be automatically copied to your clipboard</li>
            <li>Go to your Looker Studio Connector</li>
            <li>Update the configuration with the new JSON Config</li>
            <li>Save the changes to restore access to your data marts</li>
          </ol>
          <p className='font-semibold'>Are you sure you want to rotate the secret key?</p>
        </div>
      </ConfirmationDialog>
    </div>
  );
};
