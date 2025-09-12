import { appSettingsService } from '../../services/app-settings.service';
import { RequestStatus } from '../../../shared/types/request-status';
import type { AnyAction } from '../types';

export interface SettingsState {
  data: Record<string, unknown> | null;
  callState: RequestStatus;
  error?: string;
}

const initialState: SettingsState = {
  data: null,
  callState: RequestStatus.IDLE,
};

// Actions
export const LOAD_SETTINGS = 'settings/LOAD_SETTINGS';
export const LOAD_SETTINGS_SUCCESS = 'settings/LOAD_SETTINGS_SUCCESS';
export const LOAD_SETTINGS_ERROR = 'settings/LOAD_SETTINGS_ERROR';

export function loadSettings() {
  return { type: LOAD_SETTINGS } satisfies AnyAction;
}

export function loadSettingsSuccess(payload: Record<string, unknown>) {
  return { type: LOAD_SETTINGS_SUCCESS, payload } satisfies AnyAction;
}

export function loadSettingsError(payload: string) {
  return { type: LOAD_SETTINGS_ERROR, payload } satisfies AnyAction;
}

export function settingsReducer(
  state: SettingsState = initialState,
  action: AnyAction
): SettingsState {
  switch (action.type) {
    case LOAD_SETTINGS:
      return { ...state, callState: RequestStatus.LOADING, error: undefined };
    case LOAD_SETTINGS_SUCCESS:
      return {
        ...state,
        callState: RequestStatus.LOADED,
        data: action.payload as Record<string, unknown>,
      };
    case LOAD_SETTINGS_ERROR:
      return { ...state, callState: RequestStatus.ERROR, error: action.payload as string };
    default:
      return state;
  }
}

export async function fetchSettings(dispatch: (action: AnyAction) => void): Promise<void> {
  try {
    dispatch(loadSettings());
    const settings = await appSettingsService.getSettings();
    dispatch(loadSettingsSuccess(settings as unknown as Record<string, unknown>));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load settings';
    dispatch(loadSettingsError(message));
  }
}
