import { useState, useCallback } from 'react';
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

  const onSave = async (data: DataStorageFormData) => {
    if (dataStorage) {
      const updatedStorage = await updateDataStorage(dataStorage.id, data);
      if (updatedStorage) {
        onSaveSuccess(updatedStorage);
        onClose();
      }
    }
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
