import type { DataDestination } from '../../../shared';
import { DataDestinationForm } from '../DataDestinationEditForm';
import type { DataDestinationFormData } from '../../../shared';
import { useState, useCallback } from 'react';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import { useDataDestination } from '../../../shared';
import { DestinationMapperFactory } from '../../../shared/model/mappers/destination-mapper.factory.ts';

interface DataDestinationEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  dataDestination: DataDestination | null;
  onSaveSuccess: (dataDestination: DataDestination) => void;
}

export function DataDestinationConfigSheet({
  isOpen,
  onClose,
  dataDestination,
  onSaveSuccess,
}: DataDestinationEditSheetProps) {
  const { updateDataDestination, createDataDestination } = useDataDestination();

  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const confirmClose = useCallback(() => {
    setShowUnsavedDialog(false);
    setIsDirty(false);
    onClose();
  }, [onClose]);

  const handleFormDirtyChange = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  const onSave = async (data: DataDestinationFormData) => {
    const mapper = DestinationMapperFactory.getMapper(data.type);

    if (!dataDestination) {
      const createData = mapper.mapToCreateRequest(data);
      console.log(createData);
      const newDestination = await createDataDestination(createData);
      if (newDestination) {
        onSaveSuccess(newDestination);
      }
    } else {
      const updateData = mapper.mapToUpdateRequest(data);
      const updatedDestination = await updateDataDestination(dataDestination.id, updateData);
      if (updatedDestination) {
        onSaveSuccess(updatedDestination);
      }
    }
    onClose();
  };

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={open => {
          if (!open) {
            handleClose();
          }
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Configure destination</SheetTitle>
            <SheetDescription>Customize settings for your destination</SheetDescription>
          </SheetHeader>
          <DataDestinationForm
            initialData={dataDestination ?? undefined}
            onSubmit={onSave}
            onCancel={handleClose}
            onDirtyChange={handleFormDirtyChange}
          />
        </SheetContent>
      </Sheet>
      <ConfirmationDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        title='Unsaved Changes'
        description='You have unsaved changes. Exit without saving?'
        confirmLabel='Yes, leave now'
        cancelLabel='No, stay here'
        onConfirm={confirmClose}
        variant='destructive'
      />
    </>
  );
}
