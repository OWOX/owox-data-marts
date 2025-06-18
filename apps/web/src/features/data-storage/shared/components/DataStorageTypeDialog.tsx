import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@owox/ui/components/dialog';
import { Button } from '@owox/ui/components/button';
import { DataStorageTypeModel } from '../types/data-storage-type.model';
import { DataStorageType } from '../model/types';

interface DataStorageTypeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: DataStorageType) => Promise<void>;
}

export const DataStorageTypeDialog = ({
  isOpen,
  onClose,
  onSelect,
}: DataStorageTypeDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>New Data Storage</DialogTitle>
          <DialogDescription>Choose the type of data storage you want to create</DialogDescription>
        </DialogHeader>
        <div className='grid grid-cols-2 gap-4 py-4'>
          {DataStorageTypeModel.getAllTypes().map(typeInfo => {
            const Icon = typeInfo.icon;
            return (
              <Button
                key={typeInfo.type}
                variant='outline'
                className='flex flex-row items-center justify-start gap-3 p-6'
                onClick={() => void onSelect(typeInfo.type)}
              >
                <Icon size={32} />
                <span className='font-medium'>{typeInfo.displayName}</span>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
