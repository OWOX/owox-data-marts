import { useState, useEffect } from 'react';
import { useScheduledTrigger } from '../../model';
import { ScheduledTriggerTable } from '../ScheduledTriggerTable';
import { ScheduledTriggerFormSheet } from '../ScheduledTriggerFormSheet/ScheduledTriggerFormSheet';
import { toast } from 'react-hot-toast';
import { useDataMartContext } from '../../../edit/model/context';
import { ScheduledTriggerType } from '../../enums';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import { DataMartDefinitionType } from '../../../shared';
import type { ConnectorDefinitionConfig } from '../../../edit';

interface ScheduledTriggerListProps {
  dataMartId: string;
}

export function ScheduledTriggerList({ dataMartId }: ScheduledTriggerListProps) {
  const { triggers, deleteScheduledTrigger, selectScheduledTrigger, selectedTrigger } =
    useScheduledTrigger(dataMartId);
  const { dataMart } = useDataMartContext();
  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);

  // We'll enhance the triggers directly in the render method to avoid ESLint issues

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

  // Create enhanced triggers with data mart information for connector run triggers
  const enhancedTriggersForTable: ScheduledTrigger[] = triggers.map(trigger => {
    // Only enhance CONNECTOR_RUN type triggers and only if dataMart is available
    if (trigger.type === ScheduledTriggerType.CONNECTOR_RUN && dataMart) {
      const isConnectorDefinition =
        dataMart.definitionType === DataMartDefinitionType.CONNECTOR && dataMart.definition != null;
      // Create a compatible dataMart object with the required projectId property
      return {
        ...trigger,
        dataMart: {
          id: dataMart.id,
          title: dataMart.title,
          definitionType: dataMart.definitionType ?? undefined,
          definition: isConnectorDefinition
            ? (dataMart.definition as ConnectorDefinitionConfig)
            : undefined,
          projectId: dataMartId, // Use the dataMartId from props as the projectId
        },
      };
    }
    return trigger;
  });

  return (
    <>
      <ScheduledTriggerTable
        triggers={enhancedTriggersForTable}
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
