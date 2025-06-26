import type { DataStorage } from '../../../shared/model/types/data-storage.ts';
import { DataStorageForm } from '../DataStorageEditForm';
import { DialogDescription, DialogTitle } from '@owox/ui/components/dialog';
import type { DataStorageFormData } from '../../../shared/types/data-storage.schema.ts';
import { Sheet, SheetContent, SheetHeader } from '@owox/ui/components/sheet';
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

  const onSave = async (data: DataStorageFormData) => {
    if (dataStorage) {
      const updatedStorage = await updateDataStorage(dataStorage.id, data);
      if (updatedStorage) {
        onSaveSuccess(updatedStorage);
      }
    }
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        onOpenAutoFocus={e => {
          e.preventDefault();
        }}
        className='flex h-full min-w-[480px] flex-col'
      >
        <SheetHeader>
          <DialogTitle>Configure Data Storage Provider</DialogTitle>
          <DialogDescription>Customize settings for your data storage provider</DialogDescription>
        </SheetHeader>
        <div className='flex-1 overflow-y-auto p-4'>
          <DataStorageForm
            initialData={dataStorage ?? undefined}
            onSubmit={onSave}
            onCancel={onClose}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
