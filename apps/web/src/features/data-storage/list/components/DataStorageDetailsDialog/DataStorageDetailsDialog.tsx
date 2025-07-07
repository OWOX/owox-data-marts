import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@owox/ui/components/dialog';
import { DataStorageDetails } from '../../../shared';
import { useDataStorage } from '../../../shared/model/hooks/useDataStorage';

interface DataStorageDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  id: string;
}

export function DataStorageDetailsDialog({ isOpen, onClose, id }: DataStorageDetailsDialogProps) {
  const { getDataStorageById, currentDataStorage, loading, clearCurrentDataStorage } =
    useDataStorage();

  useEffect(() => {
    if (isOpen && id) {
      void getDataStorageById(id);
    }

    return () => {
      if (!isOpen) {
        clearCurrentDataStorage();
      }
    };
  }, [isOpen, id, getDataStorageById, clearCurrentDataStorage]);

  const handleClose = () => {
    clearCurrentDataStorage();
    onClose();
  };
  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Storage Details</DialogTitle>
          <DialogDescription>View detailed information about this storage.</DialogDescription>
        </DialogHeader>
        <div className='py-4'>
          <DataStorageDetails dataStorage={currentDataStorage} isLoading={loading} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
