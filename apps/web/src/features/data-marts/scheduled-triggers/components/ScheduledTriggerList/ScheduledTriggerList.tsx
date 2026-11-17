import { useCallback, useEffect, useRef, useState } from 'react';
import { useRecordSheet } from '../../../../../shared/hooks';
import { useScheduledTrigger } from '../../model';
import { ScheduledTriggerTable } from '../ScheduledTriggerTable';
import { ScheduledTriggerFormSheet } from '../ScheduledTriggerFormSheet/ScheduledTriggerFormSheet';
interface ScheduledTriggerListProps {
  dataMartId: string;
  onRequestCreate?: () => void;
}

export function ScheduledTriggerList({ dataMartId, onRequestCreate }: ScheduledTriggerListProps) {
  const { triggers, isLoading, error, deleteScheduledTrigger } = useScheduledTrigger(dataMartId);

  // The context has no first-load flag and `isLoading` turns true again on save and delete.
  const [hasLoaded, setHasLoaded] = useState(false);
  const wasLoading = useRef(false);
  useEffect(() => {
    if (isLoading) wasLoading.current = true;
    else if (wasLoading.current && !error) setHasLoaded(true);
  }, [isLoading, error]);

  const {
    record: editingTrigger,
    open: handleEditTrigger,
    close: handleCloseFormSheet,
    link,
  } = useRecordSheet({
    param: 'trigger',
    records: hasLoaded ? triggers : undefined,
    getId: trigger => trigger.id,
    notFoundMessage: () => 'This trigger was deleted or is not available.',
  });

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
        onRequestCreate={onRequestCreate}
      />
      <ScheduledTriggerFormSheet
        isOpen={editingTrigger !== null}
        onClose={handleCloseFormSheet}
        dataMartId={dataMartId}
        trigger={editingTrigger}
        link={link}
      />
    </>
  );
}
