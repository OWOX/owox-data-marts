import type { ScheduledTrigger } from '../scheduled-trigger.model';
import { ScheduledTriggerType } from '../../enums';
import type { ScheduledTriggerConfig } from '../trigger-config.types.ts';

export interface ScheduledTriggerState {
  triggers: ScheduledTrigger[];
  selectedTrigger: ScheduledTrigger | null;
  isLoading: boolean;
  error: string | null;
}

export type ScheduledTriggerAction =
  | { type: 'FETCH_TRIGGERS_START' }
  | { type: 'FETCH_TRIGGERS_SUCCESS'; payload: ScheduledTrigger[] }
  | { type: 'FETCH_TRIGGERS_ERROR'; payload: string }
  | { type: 'FETCH_TRIGGER_START' }
  | { type: 'FETCH_TRIGGER_SUCCESS'; payload: ScheduledTrigger }
  | { type: 'FETCH_TRIGGER_ERROR'; payload: string }
  | { type: 'CREATE_TRIGGER_START' }
  | { type: 'CREATE_TRIGGER_SUCCESS'; payload: ScheduledTrigger }
  | { type: 'CREATE_TRIGGER_ERROR'; payload: string }
  | { type: 'UPDATE_TRIGGER_START' }
  | { type: 'UPDATE_TRIGGER_SUCCESS'; payload: ScheduledTrigger }
  | { type: 'UPDATE_TRIGGER_ERROR'; payload: string }
  | { type: 'DELETE_TRIGGER_START' }
  | { type: 'DELETE_TRIGGER_SUCCESS'; payload: string }
  | { type: 'DELETE_TRIGGER_ERROR'; payload: string }
  | { type: 'SELECT_TRIGGER'; payload: ScheduledTrigger | null }
  | { type: 'RESET' };

export interface ScheduledTriggerContextType extends ScheduledTriggerState {
  getScheduledTriggers: (dataMartId: string) => Promise<void>;
  getScheduledTriggersByType: (
    dataMartId: string,
    triggerType: ScheduledTriggerType
  ) => Promise<void>;
  getScheduledTrigger: (dataMartId: string, id: string) => Promise<void>;
  createScheduledTrigger: (
    dataMartId: string,
    type: ScheduledTriggerType,
    cronExpression: string,
    timeZone: string,
    isActive: boolean,
    triggerConfig: ScheduledTriggerConfig
  ) => Promise<ScheduledTrigger>;
  updateScheduledTrigger: (
    dataMartId: string,
    id: string,
    cronExpression: string,
    timeZone: string,
    isActive: boolean
  ) => Promise<void>;
  deleteScheduledTrigger: (dataMartId: string, id: string) => Promise<void>;
  selectScheduledTrigger: (trigger: ScheduledTrigger | null) => void;
  reset: () => void;
}
