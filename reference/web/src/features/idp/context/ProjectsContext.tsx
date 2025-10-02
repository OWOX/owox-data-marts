import React, { useCallback, useReducer } from 'react';
import { getProjectsApi } from '../services';
import type { Projects } from '../types';
import { getTokenProvider } from '../../../app/api/token-provider';
import { RequestStatus } from '../../../shared/types/request-status.ts';
import { type ApiError, extractApiError } from '../../../app/api';
import type { ProjectsContextType, ProjectsState } from './ProjectContext.types.ts';
import { ProjectsContext } from '../hooks/useProjects.ts';
import { AxiosError } from 'axios';

const initialState: ProjectsState = {
  projects: [],
  callState: RequestStatus.IDLE,
  error: null,
};

type Action =
  | { type: 'LOADING' }
  | { type: 'SUCCESS'; payload: Projects }
  | { type: 'ERROR'; payload: ApiError }
  | { type: 'RESET' };

function reducer(state: ProjectsState, action: Action): ProjectsState {
  switch (action.type) {
    case 'LOADING':
      return { ...state, callState: RequestStatus.LOADING, error: null };
    case 'SUCCESS':
      return { projects: action.payload, callState: RequestStatus.LOADED, error: null };
    case 'ERROR':
      return { ...state, callState: RequestStatus.ERROR, error: action.payload };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const loadProjects = useCallback(async () => {
    dispatch({ type: 'LOADING' });
    try {
      const provider = getTokenProvider();
      if (!provider) {
        dispatch({ type: 'ERROR', payload: extractApiError(new AxiosError('No token provider')) });
        return;
      }

      const token = provider.getAccessToken();
      if (!token) {
        dispatch({
          type: 'ERROR',
          payload: extractApiError(new AxiosError('Unable to obtain access token')),
        });
        return;
      }

      const projects = await getProjectsApi(token);
      dispatch({ type: 'SUCCESS', payload: projects });
    } catch (e) {
      dispatch({ type: 'ERROR', payload: extractApiError(e) });
    }
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);
  const isLoading = state.callState === RequestStatus.LOADING;

  const value: ProjectsContextType = { ...state, loadProjects, reset, isLoading };

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}
