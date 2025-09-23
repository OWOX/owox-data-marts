import { appFlagsService } from '../../services/app-flags.service.ts';
import { RequestStatus } from '../../../shared/types/request-status';
import type { AnyAction } from '../types';
import { DEFAULT_FLAGS } from '../default-flags';

export interface FlagsState {
  data: Record<string, unknown> | null;
  callState: RequestStatus;
  error?: string;
}

const initialState: FlagsState = {
  data: { ...DEFAULT_FLAGS },
  callState: RequestStatus.IDLE,
};

// Actions
export const LOAD_FLAGS = 'settings/LOAD_FLAGS';
export const LOAD_FLAGS_SUCCESS = 'settings/LOAD_FLAGS_SUCCESS';
export const LOAD_FLAGS_ERROR = 'settings/LOAD_FLAGS_ERROR';

export function loadflags() {
  return { type: LOAD_FLAGS } satisfies AnyAction;
}

export function loadFlagsSuccess(payload: Record<string, unknown>) {
  return { type: LOAD_FLAGS_SUCCESS, payload } satisfies AnyAction;
}

export function loadFlagsError(payload: string) {
  return { type: LOAD_FLAGS_ERROR, payload } satisfies AnyAction;
}

export function flagsReducer(state: FlagsState = initialState, action: AnyAction): FlagsState {
  switch (action.type) {
    case LOAD_FLAGS:
      return { ...state, callState: RequestStatus.LOADING, error: undefined };
    case LOAD_FLAGS_SUCCESS:
      return {
        ...state,
        callState: RequestStatus.LOADED,
        // Merge defaults with fetched flags; fetched values take precedence
        data: { ...DEFAULT_FLAGS, ...(action.payload as Record<string, unknown>) },
      };
    case LOAD_FLAGS_ERROR:
      return { ...state, callState: RequestStatus.ERROR, error: action.payload as string };
    default:
      return state;
  }
}

export async function fetchFlags(dispatch: (action: AnyAction) => void): Promise<void> {
  try {
    dispatch(loadflags());
    const flags = await appFlagsService.getFlags();
    dispatch(loadFlagsSuccess(flags as unknown as Record<string, unknown>));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load settings';
    dispatch(loadFlagsError(message));
  }
}
