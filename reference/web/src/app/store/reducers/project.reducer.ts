import type { AnyAction } from '../types';

export interface ProjectState {
  id: string | null;
  title: string | null;
}

const initialState: ProjectState = {
  id: null,
  title: null,
};

// Actions
export const SET_PROJECT = 'project/SET_PROJECT';
export const CLEAR_PROJECT = 'project/CLEAR_PROJECT';

export function setProject(payload: { id: string; title: string | null }) {
  return { type: SET_PROJECT, payload } satisfies AnyAction;
}

export function clearProject() {
  return { type: CLEAR_PROJECT } satisfies AnyAction;
}

export function projectReducer(
  state: ProjectState = initialState,
  action: AnyAction
): ProjectState {
  switch (action.type) {
    case SET_PROJECT: {
      const { id, title } = action.payload as { id: string; title?: string | null };
      return { id, title: title ?? null };
    }
    case CLEAR_PROJECT:
      return { ...initialState };
    default:
      return state;
  }
}
