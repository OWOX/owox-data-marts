import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { useUrlParam, useProjectRoute } from '../../../../../shared/hooks';
import { DataDestinationConfigSheet } from '../../../edit';
import {
  dataDestinationService,
  generateLookerStudioJsonConfig,
  useDataDestination,
} from '../../../shared';
import type { DataDestinationImpactResponseDto } from '../../../shared/services/types';
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

function buildReportsDestinationFilterPath(destinationTitle: string) {
  const params = new URLSearchParams({
    filters: JSON.stringify([{ f: 'destination', o: 'eq', v: [destinationTitle] }]),
  });

  return `/data-marts/reports?${params.toString()}`;
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
  const [blocked, setBlocked] = useState<{
    destinationId: string;
    impact: DataDestinationImpactResponseDto;
  } | null>(null);
  const { scope } = useProjectRoute();

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

  const handleDelete = async (id: string) => {
    try {
      const impact = await dataDestinationService.getDataDestinationImpact(id);
      if (impact.reportsCount > 0) {
        setBlocked({ destinationId: id, impact });
        return;
      }
      setDestinationToDelete(id);
      setDeleteDialogOpen(true);
    } catch (error) {
      // Network/auth failures fall through to the plain confirm dialog so the
      // admin can still attempt the delete; the backend will surface the real
      // reason if there is one.
      console.error('Failed to load destination impact:', error);
      setDestinationToDelete(id);
      setDeleteDialogOpen(true);
    }
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
    createdByUser: destination.createdByUser,
    ownerUsers: destination.ownerUsers,
    availableForUse: destination.availableForUse,
    availableForMaintenance: destination.availableForMaintenance,
    contexts: destination.contexts ?? [],
  }));

  const onDeleteCallback = (id: string) => {
    void handleDelete(id);
  };

  const columns = getDataDestinationColumns({
    onEdit: handleEdit,
    onDelete: onDeleteCallback,
    onRotateSecretKey: handleRotateSecretKey,
  });

  return (
    <div data-testid='destTab'>
      <DataDestinationTable
        columns={columns}
        data={tableData}
        onEdit={handleEdit}
        onDelete={onDeleteCallback}
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
        open={!!blocked}
        onOpenChange={open => {
          if (!open) setBlocked(null);
        }}
        title='Cannot delete destination'
        description={
          blocked ? (
            <span className='block space-y-2'>
              <span className='block'>
                <strong>&ldquo;{blocked.impact.destinationTitle}&rdquo;</strong> is referenced by{' '}
                <Link
                  to={scope(buildReportsDestinationFilterPath(blocked.impact.destinationTitle))}
                  className='text-primary hover:underline'
                  onClick={() => {
                    setBlocked(null);
                  }}
                >
                  {blocked.impact.reportsCount} Report
                  {blocked.impact.reportsCount === 1 ? '' : 's'}
                </Link>{' '}
                across {blocked.impact.dataMartCount} Data Mart
                {blocked.impact.dataMartCount === 1 ? '' : 's'}.
              </span>
              <span className='text-muted-foreground block'>
                Remove or repoint those reports before deleting the destination.
              </span>
            </span>
          ) : null
        }
        confirmLabel='Got it'
        variant='default'
        onConfirm={() => {
          setBlocked(null);
        }}
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
            <li>Go to your Data Studio Connector</li>
            <li>Update the configuration with the new JSON Config</li>
            <li>Save the changes to restore access to your data marts</li>
          </ol>
          <p className='font-semibold'>Are you sure you want to rotate the secret key?</p>
        </div>
      </ConfirmationDialog>
    </div>
  );
};
