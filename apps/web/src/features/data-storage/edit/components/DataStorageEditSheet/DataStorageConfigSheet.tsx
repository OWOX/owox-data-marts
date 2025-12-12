import { useEffect, useRef } from 'react';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@owox/ui/components/sheet';
import type { DataStorage } from '../../../shared/model/types/data-storage.ts';
import { DataStorageForm } from '../DataStorageEditForm';
import type { DataStorageFormData } from '../../../shared';
import { useDataStorage } from '../../../shared/model/hooks/useDataStorage.ts';
import { trackEvent } from '../../../../../utils';
import { useUnsavedGuard } from '../../../../../hooks/useUnsavedGuard';
import { useIntercomLauncher } from '../../../../../shared/hooks/useIntercomLauncher';

interface DataStorageEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  dataStorage: DataStorage | null;
  onSaveSuccess: (dataStorage: DataStorage) => void;
}

export function DataStorageConfigSheet({
  isOpen,
  onClose,
  dataStorage,
  onSaveSuccess,
}: DataStorageEditSheetProps) {
  const { updateDataStorage } = useDataStorage();

  useIntercomLauncher(isOpen);

  const {
    showUnsavedDialog,
    setShowUnsavedDialog,
    handleClose,
    confirmClose,
    handleFormDirtyChange,
    handleFormSubmitSuccess,
  } = useUnsavedGuard(onClose);

  const onSave = async (data: DataStorageFormData) => {
    if (dataStorage) {
      const updatedStorage = await updateDataStorage(dataStorage.id, data);
      if (updatedStorage) {
        onSaveSuccess(updatedStorage);
        handleFormSubmitSuccess();
      }
    }
  };

  const wasOpenRef = useRef<boolean>(false);
  useEffect(() => {
    const mode = dataStorage ? 'Edit' : 'Create';
    if (isOpen && !wasOpenRef.current) {
      trackEvent({
        event: 'data_storage_config_open',
        category: 'DataStorage',
        action: mode,
        label: dataStorage?.type,
      });
      wasOpenRef.current = true;
    } else if (!isOpen && wasOpenRef.current) {
      trackEvent({
        event: 'data_storage_config_close',
        category: 'DataStorage',
        action: mode,
        label: dataStorage?.type,
      });
      wasOpenRef.current = false;
    }
  }, [isOpen, dataStorage]);

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
            <SheetTitle>Configure Storage Provider</SheetTitle>
            <SheetDescription>Customize settings for your storage provider</SheetDescription>
          </SheetHeader>
          <DataStorageForm
            initialData={dataStorage ?? undefined}
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
