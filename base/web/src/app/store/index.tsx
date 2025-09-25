import React, { useEffect, useMemo } from 'react';
import { StoreProvider } from './core/store';
import { useAppDispatch, useAppSelector } from './core/store-hooks';
import { combineReducers } from './core/store-utils';
import { projectReducer, setProject, type ProjectState } from './reducers/project.reducer';
import { flagsReducer, fetchFlags, type FlagsState } from './reducers/flags.reducer';
import { useAuth } from '../../features/idp';
import { AuthStatus } from '../../features/idp';
import { LoadingSpinner } from '@owox/ui/components/common/loading-spinner';
import { RequestStatus } from '../../shared/types/request-status.ts';

export interface RootState {
  project: ProjectState;
  flags: FlagsState;
  app: {
    ready: boolean;
  };
}

const APP_SET_READY = 'app/SET_READY';
function appReducer(state = { ready: false }, action: { type: string; payload?: unknown }) {
  switch (action.type) {
    case APP_SET_READY:
      return { ...state, ready: Boolean(action.payload) };
    default:
      return state;
  }
}

const rootReducer = combineReducers<RootState>({
  project: projectReducer,
  flags: flagsReducer,
  app: appReducer,
});

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider
      reducer={rootReducer}
      initialState={{
        project: { id: null, title: null },
        flags: { data: null, callState: RequestStatus.IDLE },
        app: { ready: false },
      }}
    >
      {children}
    </StoreProvider>
  );
}

export function AppBootstrap({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const { user, status } = useAuth();
  const flagsState = useAppSelector((s: RootState) => s.flags);
  const flagsStatus: FlagsState['callState'] = flagsState.callState;
  const isReady = useAppSelector((s: RootState) => s.app.ready);

  useEffect(() => {
    if (status === AuthStatus.AUTHENTICATED && user?.projectId) {
      dispatch(setProject({ id: user.projectId, title: user.projectTitle ?? null }));
      if (flagsStatus === RequestStatus.IDLE) {
        void fetchFlags(dispatch);
      }
    }
  }, [status, user?.projectId, user?.projectTitle, flagsStatus, dispatch]);

  useEffect(() => {
    const ready =
      status === AuthStatus.AUTHENTICATED &&
      Boolean(user?.projectId) &&
      flagsStatus === RequestStatus.LOADED;
    dispatch({ type: APP_SET_READY, payload: ready });
  }, [status, user?.projectId, flagsStatus, dispatch]);

  const loader = useMemo(() => <LoadingSpinner fullScreen message='Loading application...' />, []);

  if (!isReady) {
    if (flagsStatus === RequestStatus.ERROR) {
      return (
        <LoadingSpinner
          fullScreen
          message={`Failed to load app flags: ${flagsState.error ?? ''}`}
        />
      );
    }
    return loader;
  }

  return <>{children}</>;
}
