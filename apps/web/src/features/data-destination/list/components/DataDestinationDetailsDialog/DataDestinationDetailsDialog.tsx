import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@owox/ui/components/dialog';
import { DataDestinationDetails } from '../../../shared';
import { useDataDestination } from '../../../shared';

interface DataDestinationDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  id: string;
}

export function DataDestinationDetailsDialog({
  isOpen,
  onClose,
  id,
}: DataDestinationDetailsDialogProps) {
  const { getDataDestinationById, currentDataDestination, loading, clearCurrentDataDestination } =
    useDataDestination();

  useEffect(() => {
    if (isOpen && id) {
      void getDataDestinationById(id);
    }

    return () => {
      if (!isOpen) {
        clearCurrentDataDestination();
      }
    };
  }, [isOpen, id, getDataDestinationById, clearCurrentDataDestination]);

  const handleClose = () => {
    clearCurrentDataDestination();
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
          <DialogTitle>Data Destination Details</DialogTitle>
          <DialogDescription>
            View detailed information about this data destination.
          </DialogDescription>
        </DialogHeader>
        <div className='py-4'>
          <DataDestinationDetails dataDestination={currentDataDestination} isLoading={loading} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
