import { useState, useEffect } from 'react';
import { useScheduledTrigger } from '../../model';
import { ScheduledTriggerTable } from '../ScheduledTriggerTable';
import { ScheduledTriggerFormSheet } from '../ScheduledTriggerFormSheet/ScheduledTriggerFormSheet';
import { toast } from 'react-hot-toast';
interface ScheduledTriggerListProps {
  dataMartId: string;
}

export function ScheduledTriggerList({ dataMartId }: ScheduledTriggerListProps) {
  const { triggers, deleteScheduledTrigger, selectScheduledTrigger, selectedTrigger } =
    useScheduledTrigger(dataMartId);
  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);

  useEffect(() => {
    if (selectedTrigger) {
      setIsFormSheetOpen(true);
    }
  }, [selectedTrigger]);

  const handleEditTrigger = (triggerId: string) => {
    const trigger = triggers.find(t => t.id === triggerId);
    if (trigger) {
      selectScheduledTrigger(trigger);
    }
  };

  const handleCloseFormSheet = () => {
    setIsFormSheetOpen(false);
    selectScheduledTrigger(null);
  };

  const handleDeleteTrigger = async (triggerId: string) => {
    try {
      await deleteScheduledTrigger(dataMartId, triggerId);
      toast.success('Trigger deleted successfully');
    } catch (error) {
      console.error('Error deleting trigger:', error);
      toast.error('Failed to delete trigger');
    }
  };

  return (
    <>
      <ScheduledTriggerTable
        triggers={triggers}
        dataMartId={dataMartId}
        onEditTrigger={handleEditTrigger}
        onDeleteTrigger={id => void handleDeleteTrigger(id)}
      />
      <ScheduledTriggerFormSheet
        isOpen={isFormSheetOpen}
        onClose={handleCloseFormSheet}
        dataMartId={dataMartId}
      />
    </>
  );
}
