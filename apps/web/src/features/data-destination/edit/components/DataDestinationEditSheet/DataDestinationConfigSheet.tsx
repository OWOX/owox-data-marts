import { type DataDestination, DataDestinationType } from '../../../shared';
import { DataDestinationForm } from '../DataDestinationEditForm';
import type { DataDestinationFormData } from '../../../shared';
import { useEffect, useRef } from 'react';
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
import { trackEvent } from '../../../../../utils';
import { useUnsavedGuard } from '../../../../../hooks/useUnsavedGuard';

interface DataDestinationEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  dataDestination: DataDestination | null;
  onSaveSuccess: (dataDestination: DataDestination) => void;
  initialFormData?: DataDestinationFormData;
  allowedDestinationTypes?: DataDestinationType[];
}

export function DataDestinationConfigSheet({
  isOpen,
  onClose,
  dataDestination,
  onSaveSuccess,
  initialFormData,
  allowedDestinationTypes,
}: DataDestinationEditSheetProps) {
  const { updateDataDestination, createDataDestination } = useDataDestination();

  const {
    showUnsavedDialog,
    setShowUnsavedDialog,
    handleClose,
    confirmClose,
    handleFormDirtyChange,
    handleFormSubmitSuccess,
  } = useUnsavedGuard(onClose);

  const onSave = async (data: DataDestinationFormData) => {
    const mapper = DestinationMapperFactory.getMapper(data.type);

    if (!dataDestination) {
      const createData = mapper.mapToCreateRequest(data);
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
    handleFormSubmitSuccess();
  };

  const wasOpenRef = useRef<boolean>(false);
  useEffect(() => {
    const mode = dataDestination ? 'Edit' : 'Create';
    if (isOpen && !wasOpenRef.current) {
      trackEvent({
        event: 'data_destination_config_open',
        category: 'DataDestination',
        action: mode,
        label: dataDestination?.type,
      });
      wasOpenRef.current = true;
    } else if (!isOpen && wasOpenRef.current) {
      trackEvent({
        event: 'data_destination_config_close',
        category: 'DataDestination',
        action: mode,
        label: dataDestination?.type,
      });
      wasOpenRef.current = false;
    }
  }, [isOpen, dataDestination]);

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
            initialData={dataDestination ?? initialFormData ?? null}
            onSubmit={onSave}
            onCancel={handleClose}
            onDirtyChange={handleFormDirtyChange}
            isEditMode={!!dataDestination}
            allowedDestinationTypes={allowedDestinationTypes}
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
