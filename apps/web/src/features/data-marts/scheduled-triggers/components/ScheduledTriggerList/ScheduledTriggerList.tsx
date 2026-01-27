import { useState, useEffect, useCallback } from 'react';
import { useScheduledTrigger } from '../../model';
import { ScheduledTriggerTable } from '../ScheduledTriggerTable';
import { ScheduledTriggerFormSheet } from '../ScheduledTriggerFormSheet/ScheduledTriggerFormSheet';
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

  const handleEditTrigger = useCallback(
    (triggerId: string) => {
      const trigger = triggers.find(t => t.id === triggerId);
      if (trigger) {
        selectScheduledTrigger(trigger);
      }
    },
    [triggers, selectScheduledTrigger]
  );

  const handleCloseFormSheet = useCallback(() => {
    setIsFormSheetOpen(false);
    selectScheduledTrigger(null);
  }, [selectScheduledTrigger]);

  const handleDeleteTrigger = useCallback(
    async (triggerId: string) => {
      try {
        await deleteScheduledTrigger(dataMartId, triggerId);
      } catch (error) {
        console.error('Error deleting trigger:', error);
      }
    },
    [deleteScheduledTrigger, dataMartId]
  );

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
