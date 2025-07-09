import { useContext } from 'react';
import { ScheduledTriggerContext } from './scheduled-trigger-context';

/**
 * Hook for accessing the Scheduled Trigger context
 * @returns Scheduled Trigger context
 * @throws Error if used outside of a ScheduledTriggerProvider
 */
export function useScheduledTriggerContext() {
  const context = useContext(ScheduledTriggerContext);
  if (context === undefined) {
    throw new Error('useScheduledTriggerContext must be used within a ScheduledTriggerProvider');
  }
  return context;
}
