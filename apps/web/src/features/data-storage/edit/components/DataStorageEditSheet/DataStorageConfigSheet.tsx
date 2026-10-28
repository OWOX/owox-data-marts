import { useEffect, useRef, useState } from 'react';
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
import { CardSkeleton } from '../../../../../shared/components/CardSkeleton';
import { FormItem } from '@owox/ui/components/form';
import { Button } from '@owox/ui/components/button';

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
  const { updateDataStorage, getDataStorageById, currentDataStorage, clearCurrentDataStorage } =
    useDataStorage();

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

  // The Storages page hands over the copy it just loaded; any other copy may be stale.
  const ownCopyId =
    isOpen && dataStorage && dataStorage !== currentDataStorage ? dataStorage.id : null;
  const [load, setLoad] = useState<'loading' | 'loaded' | 'failed' | 'forbidden'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ownCopyId) return;
    let current = true;
    // The sheet says why it failed; a Data Mart's Storage card opens it for members without SEE.
    getDataStorageById(ownCopyId, { skipErrorToast: true }).then(
      () => {
        if (current) setLoad('loaded');
      },
      (error: unknown) => {
        const status = (error as { response?: { status?: number } }).response?.status;
        if (current) setLoad(status === 403 ? 'forbidden' : 'failed');
      }
    );
    return () => {
      current = false;
      setLoad('loading');
    };
  }, [ownCopyId, attempt, getDataStorageById]);
  // A copy loaded during this open must not be shown at the next one.
  useEffect(() => {
    if (isOpen) return clearCurrentDataStorage;
  }, [isOpen, clearCurrentDataStorage]);
  let formStorage = dataStorage;
  if (ownCopyId) {
    formStorage =
      load === 'loaded' && currentDataStorage?.id === ownCopyId ? currentDataStorage : null;
  }
  const loadFailed = ownCopyId !== null && load === 'failed';
  const forbidden = ownCopyId !== null && load === 'forbidden';

  const onSave = async (data: DataStorageFormData) => {
    if (dataStorage) {
      // Throws on a rejected save; the form catches it to highlight the fields to fix.
      const updatedStorage = await updateDataStorage(dataStorage.id, data);
      // Saved. A fault in what the caller does with the result is not a failed save: let it
      // reach the form and the form reports "Failed to save" and keeps the sheet open.
      try {
        onSaveSuccess(updatedStorage);
      } catch (error) {
        console.error('Storage saved, but handling the result failed', error);
      }
      handleFormSubmitSuccess();
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
        {loadFailed && (
          <FormItem role='alert' className='items-start gap-3 text-sm'>
            <p className='text-muted-foreground'>This Storage could not be loaded.</p>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => {
                setAttempt(value => value + 1);
              }}
            >
              Retry
            </Button>
          </FormItem>
        )}
        {forbidden && (
          <p role='status' className='text-muted-foreground text-sm'>
            You don&apos;t have access to this Storage.
          </p>
        )}
        {!loadFailed && !forbidden && ownCopyId && !formStorage && <CardSkeleton />}
        {(!ownCopyId || formStorage) && (
          <DataStorageForm
            initialData={formStorage ?? undefined}
            onSubmit={onSave}
            onCancel={handleClose}
            onDirtyChange={handleFormDirtyChange}
          />
        )}
        <UnsavedChangesConfirmationDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onConfirm={confirmClose}
        />
      </SheetContent>
    </Sheet>
  );
}
