import type { ScheduledTriggerState, ScheduledTriggerAction } from './scheduled-trigger-types';

/**
 * Initial state for the scheduled trigger reducer
 */
export const initialState: ScheduledTriggerState = {
  triggers: [],
  selectedTrigger: null,
  isLoading: false,
  error: null,
};

/**
 * Reducer function for the scheduled trigger context
 * @param state Current state
 * @param action Action to perform
 * @returns New state
 */
export function scheduledTriggerReducer(
  state: ScheduledTriggerState,
  action: ScheduledTriggerAction
): ScheduledTriggerState {
  switch (action.type) {
    // All START actions
    case 'FETCH_TRIGGERS_START':
    case 'FETCH_TRIGGER_START':
    case 'CREATE_TRIGGER_START':
    case 'UPDATE_TRIGGER_START':
    case 'DELETE_TRIGGER_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    // SUCCESS actions
    case 'FETCH_TRIGGERS_SUCCESS':
      return {
        ...state,
        triggers: action.payload,
        isLoading: false,
      };
    case 'FETCH_TRIGGER_SUCCESS':
      return {
        ...state,
        selectedTrigger: action.payload,
        isLoading: false,
      };
    case 'CREATE_TRIGGER_SUCCESS':
      return {
        ...state,
        triggers: [...state.triggers, action.payload],
        isLoading: false,
      };
    case 'UPDATE_TRIGGER_SUCCESS':
      return {
        ...state,
        triggers: state.triggers.map(trigger =>
          trigger.id === action.payload.id ? action.payload : trigger
        ),
        selectedTrigger:
          state.selectedTrigger && state.selectedTrigger.id === action.payload.id
            ? action.payload
            : state.selectedTrigger,
        isLoading: false,
      };
    case 'DELETE_TRIGGER_SUCCESS':
      return {
        ...state,
        triggers: state.triggers.filter(trigger => trigger.id !== action.payload),
        selectedTrigger:
          state.selectedTrigger && state.selectedTrigger.id === action.payload
            ? null
            : state.selectedTrigger,
        isLoading: false,
      };

    // All ERROR actions
    case 'FETCH_TRIGGERS_ERROR':
    case 'FETCH_TRIGGER_ERROR':
    case 'CREATE_TRIGGER_ERROR':
    case 'UPDATE_TRIGGER_ERROR':
    case 'DELETE_TRIGGER_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };

    // Other actions
    case 'SELECT_TRIGGER':
      return {
        ...state,
        selectedTrigger: action.payload,
      };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}
