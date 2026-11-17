import { useEffect, useRef } from 'react';
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
    createScheduledTrigger,
    updateScheduledTrigger,
    deleteScheduledTrigger,
    reset,
    triggers,
    hasLoaded,
    isLoading,
    error,
  } = useScheduledTriggerContext();

  // A Data Mart refresh gives `getScheduledTriggers` a new identity; it must not empty the list.
  const getScheduledTriggersRef = useRef(getScheduledTriggers);
  getScheduledTriggersRef.current = getScheduledTriggers;

  useEffect(() => {
    if (dataMartId) {
      void getScheduledTriggersRef.current(dataMartId);
    } else {
      reset();
    }

    return () => {
      reset();
    };
  }, [dataMartId, reset]);

  return {
    triggers,
    hasLoaded,
    isLoading,
    error,
    getScheduledTriggers: (id: string) => getScheduledTriggers(id),
    getScheduledTriggersByType: (id: string, type: ScheduledTriggerType) =>
      getScheduledTriggersByType(id, type),
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
  };
}
