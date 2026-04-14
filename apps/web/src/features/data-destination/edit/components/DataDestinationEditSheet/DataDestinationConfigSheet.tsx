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
import { DestinationMapperFactory } from '../../../shared/model/mappers/destination-mapper.factory';
import { trackEvent } from '../../../../../utils';
import { useUnsavedGuard } from '../../../../../hooks/useUnsavedGuard';
import { useIntercomLauncher } from '../../../../../shared/hooks/useIntercomLauncher';

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

  useIntercomLauncher(isOpen);

  const onSave = async (
    data: DataDestinationFormData,
    source?: { id: string; title: string } | null
  ) => {
    const mapper = DestinationMapperFactory.getMapper(data.type);

    if (!dataDestination) {
      const { ownerIds, ...formFields } = data as DataDestinationFormData & { ownerIds?: string[] };
      if (source) {
        const createData = {
          title: formFields.title,
          type: formFields.type,
          sourceDestinationId: source.id,
          ...(ownerIds !== undefined && { ownerIds }),
        };
        const newDestination = await createDataDestination(createData);
        handleFormSubmitSuccess();
        if (newDestination) {
          onSaveSuccess(newDestination);
        }
      } else {
        const createData = {
          ...mapper.mapToCreateRequest(formFields),
          ...(ownerIds !== undefined && { ownerIds }),
        };
        const newDestination = await createDataDestination(createData);
        handleFormSubmitSuccess();
        if (newDestination) {
          onSaveSuccess(newDestination);
        }
      }
    } else {
      const { ownerIds, availableForUse, availableForMaintenance, contextIds, ...formFields } =
        data as DataDestinationFormData & {
          ownerIds?: string[];
          availableForUse?: boolean;
          availableForMaintenance?: boolean;
          contextIds?: string[];
        };
      const updateData = mapper.mapToUpdateRequest(formFields);
      const requestWithExtras = {
        ...updateData,
        ...(ownerIds !== undefined && { ownerIds }),
        ...(availableForUse !== undefined && { availableForUse }),
        ...(availableForMaintenance !== undefined && { availableForMaintenance }),
        ...(contextIds !== undefined && { contextIds }),
      };
      const updatedDestination = await updateDataDestination(dataDestination.id, requestWithExtras);
      handleFormSubmitSuccess();
      if (updatedDestination) {
        onSaveSuccess(updatedDestination);
      }
    }
  };

  const mode = dataDestination ? 'edit' : 'create';
  const wasOpenRef = useRef(false);

  useEffect(() => {
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
  }, [isOpen, dataDestination, mode]);

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
        <SheetContent data-testid='destEditSheet'>
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
            destinationId={dataDestination?.id}
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
