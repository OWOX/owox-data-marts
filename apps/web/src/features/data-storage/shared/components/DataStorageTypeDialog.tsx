import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@owox/ui/components/dialog';
import { Button } from '@owox/ui/components/button';
import { DataStorageTypeModel } from '../types/data-storage-type.model';
import { DataStorageStatus, DataStorageType } from '../model/types';
import { Badge } from '@owox/ui/components/badge';
import { useActionLock } from '../../../../shared/hooks';

interface DataStorageTypeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: DataStorageType) => Promise<void>;
  isCreatingDataStorage: boolean;
}

export const DataStorageTypeDialog = ({
  isOpen,
  onClose,
  onSelect,
  isCreatingDataStorage,
}: DataStorageTypeDialogProps) => {
  const { trigger, isLocked } = useActionLock(onSelect, 1000);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>New Storage</DialogTitle>
          <DialogDescription>Choose the type of storage you want to create</DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4 py-4'>
          {DataStorageTypeModel.getAllTypes()
            .filter(typeInfo => typeInfo.status !== DataStorageStatus.LEGACY)
            .map(typeInfo => {
              const Icon = typeInfo.icon;
              const isActive = typeInfo.status === DataStorageStatus.ACTIVE;
              return (
                <Button
                  key={typeInfo.type}
                  variant='outline'
                  className='flex px-4 py-6 select-none'
                  onClick={() => {
                    void trigger(typeInfo.type);
                  }}
                  disabled={!isActive || isCreatingDataStorage || isLocked}
                  onDoubleClick={e => {
                    e.preventDefault();
                  }}
                >
                  <span className='flex flex-grow items-center gap-2'>
                    <Icon size={24} />
                    <span className='font-medium'>{typeInfo.displayName}</span>
                  </span>
                  {typeInfo.status === DataStorageStatus.COMING_SOON && (
                    <Badge variant='secondary'>Coming soon</Badge>
                  )}
                </Button>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
