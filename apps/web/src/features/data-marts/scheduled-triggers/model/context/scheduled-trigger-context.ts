import { createContext } from 'react';
import type { ScheduledTriggerContextType } from './scheduled-trigger-types';

/**
 * React Context for the Scheduled Trigger feature.
 *
 * This context provides state and functions to manage scheduled triggers.
 */
const ScheduledTriggerContext = createContext<ScheduledTriggerContextType | undefined>(undefined);

export { ScheduledTriggerContext };
