import type { DataStorage } from '../../../shared/model/types/data-storage.ts';
import { Drawer, DrawerContent, DrawerHeader } from '@owox/ui/components/drawer';
import { DataStorageForm } from '../DataStorageEditForm';
import { DialogDescription, DialogTitle } from '@owox/ui/components/dialog';
import type { DataStorageFormData } from '../../../shared/types/data-storage.schema.ts';

interface DataStorageEditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  dataStorage: DataStorage | null;
  onSave: (data: DataStorageFormData) => Promise<void>;
}

export function DataStorageConfigDrawer({
  isOpen,
  onClose,
  dataStorage,
  onSave,
}: DataStorageEditDrawerProps) {
  return (
    <Drawer open={isOpen} onClose={onClose} direction={'right'}>
      <DrawerContent className='flex h-full min-w-[480px] flex-col'>
        <DrawerHeader>
          <DialogTitle>Configure Data Storage Provider</DialogTitle>
          <DialogDescription>Customize settings for your data storage provider</DialogDescription>
        </DrawerHeader>
        <div className='flex-1 overflow-y-auto p-4'>
          <DataStorageForm
            initialData={dataStorage ?? undefined}
            onSubmit={onSave}
            onCancel={onClose}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
