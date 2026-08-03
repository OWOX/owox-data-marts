import { useEffect, useRef } from 'react';
import { UnsavedChangesConfirmationDialog } from '../../../../../shared/components/UnsavedChangesConfirmationDialog';
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
import { useProjectRoute } from '../../../../../shared/hooks';
import { CopyLinkButton } from '@owox/ui/components/common/copy-link-button';

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

  const { scope, projectId } = useProjectRoute();
  const storageLink =
    dataStorage && projectId
      ? `${window.location.origin}${scope(`/data-storages?id=${dataStorage.id}`)}`
      : null;

  const {
    showUnsavedDialog,
    setShowUnsavedDialog,
    handleClose,
    confirmClose,
    handleFormDirtyChange,
    handleFormSubmitSuccess,
  } = useUnsavedGuard(onClose);

  const onSave = async (
    data: DataStorageFormData,
    source?: { id: string; title: string } | null
  ) => {
    if (dataStorage) {
      const updatedStorage = await updateDataStorage(dataStorage.id, data, source);
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
    <Sheet
      open={isOpen}
      onOpenChange={open => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <SheetContent data-testid='storageConfigSheet'>
        <SheetHeader>
          <SheetTitle>Configure Storage Provider</SheetTitle>
          <div className='flex w-full items-center gap-4'>
            <SheetDescription>Customize settings for your storage provider</SheetDescription>
            {storageLink && (
              <CopyLinkButton link={storageLink} ariaLabel='Copy link to this storage' />
            )}
          </div>
        </SheetHeader>
        <DataStorageForm
          initialData={dataStorage ?? undefined}
          onSubmit={onSave}
          onCancel={handleClose}
          onDirtyChange={handleFormDirtyChange}
        />
        <UnsavedChangesConfirmationDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onConfirm={confirmClose}
        />
      </SheetContent>
    </Sheet>
  );
}
