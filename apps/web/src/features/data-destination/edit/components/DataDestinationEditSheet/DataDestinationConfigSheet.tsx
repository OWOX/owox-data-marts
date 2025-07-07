import type { DataDestination } from '../../../shared';
import { DataDestinationForm } from '../DataDestinationEditForm';
import type { DataDestinationFormData } from '../../../shared';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import { useDataDestination } from '../../../shared';

interface DataDestinationEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  dataDestination: DataDestination | null;
  onSaveSuccess: (dataDestination: DataDestination) => void;
}

export function DataDestinationConfigSheet({
  isOpen,
  onClose,
  dataDestination,
  onSaveSuccess,
}: DataDestinationEditSheetProps) {
  const { updateDataDestination, createDataDestination } = useDataDestination();

  const onSave = async (data: DataDestinationFormData) => {
    if (!dataDestination) {
      const createData = {
        title: data.title,
        type: data.type,
        credentials: data.credentials,
      };
      const newDestination = await createDataDestination(createData);
      if (newDestination) {
        onSaveSuccess(newDestination);
      }
    } else {
      const updateData = {
        title: data.title,
        credentials: data.credentials,
        type: data.type,
      };
      const updatedDestination = await updateDataDestination(dataDestination.id, updateData);
      if (updatedDestination) {
        onSaveSuccess(updatedDestination);
      }
    }
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className='flex h-full min-w-[480px] flex-col'>
        <SheetHeader>
          <SheetTitle>Configure destination</SheetTitle>
          <SheetDescription>Customize settings for your destination</SheetDescription>
        </SheetHeader>
        <div className='flex-1 overflow-y-auto p-4'>
          <DataDestinationForm
            initialData={dataDestination ?? undefined}
            onSubmit={onSave}
            onCancel={onClose}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
