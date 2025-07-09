import { useEffect } from 'react';
import { useScheduledTriggerContext } from '../context';
import { ScheduledTriggerType } from '../../enums';
import type { ScheduledTriggerConfig } from '../trigger-config.types.ts';

/**
 * Hook for loading and managing scheduled triggers for a specific data mart
 * @param dataMartId ID of the data mart
 */
export function useScheduledTrigger(dataMartId?: string) {
  const {
    getScheduledTriggers,
    getScheduledTriggersByType,
    getScheduledTrigger,
    createScheduledTrigger,
    updateScheduledTrigger,
    deleteScheduledTrigger,
    selectScheduledTrigger,
    reset,
    triggers,
    selectedTrigger,
    isLoading,
    error,
  } = useScheduledTriggerContext();

  useEffect(() => {
    if (dataMartId) {
      void getScheduledTriggers(dataMartId);
    } else {
      reset();
    }

    return () => {
      reset();
    };
  }, [dataMartId, getScheduledTriggers, reset]);

  return {
    triggers,
    selectedTrigger,
    isLoading,
    error,
    getScheduledTriggers: (id: string) => getScheduledTriggers(id),
    getScheduledTriggersByType: (id: string, type: ScheduledTriggerType) =>
      getScheduledTriggersByType(id, type),
    getScheduledTrigger: (id: string, triggerId: string) => getScheduledTrigger(id, triggerId),
    createScheduledTrigger: (
      id: string,
      type: ScheduledTriggerType,
      cronExpression: string,
      timeZone: string,
      isActive: boolean,
      triggerConfig: ScheduledTriggerConfig
    ) => createScheduledTrigger(id, type, cronExpression, timeZone, isActive, triggerConfig),
    updateScheduledTrigger: (
      id: string,
      triggerId: string,
      cronExpression: string,
      timeZone: string,
      isActive: boolean
    ) => updateScheduledTrigger(id, triggerId, cronExpression, timeZone, isActive),
    deleteScheduledTrigger: (id: string, triggerId: string) =>
      deleteScheduledTrigger(id, triggerId),
    selectScheduledTrigger,
  };
}
