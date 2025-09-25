import React, { useMemo, useReducer } from 'react';
import type { AnyAction, Reducer, Dispatch } from '../types';
import { StoreDispatchContext, StoreStateContext } from './store-context';

interface StoreProviderProps<S> {
  initialState: S;
  reducer: Reducer<S>;
  children: React.ReactNode;
}

export function StoreProvider<S>({ initialState, reducer, children }: StoreProviderProps<S>) {
  const [state, dispatch] = useReducer(reducer as React.Reducer<S, AnyAction>, initialState);

  const dispatchMemo = useMemo<Dispatch>(() => dispatch as Dispatch, [dispatch]);

  return (
    <StoreStateContext.Provider value={state as unknown}>
      <StoreDispatchContext.Provider value={dispatchMemo}>{children}</StoreDispatchContext.Provider>
    </StoreStateContext.Provider>
  );
}
