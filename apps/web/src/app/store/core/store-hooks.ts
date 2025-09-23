import { useContext } from 'react';
import type { Dispatch } from '../types';
import { StoreDispatchContext, StoreStateContext } from './store-context';
import type { RootState } from '../index';

export function useAppDispatch(): Dispatch {
  return useContext(StoreDispatchContext);
}

export function useAppSelector<T>(selector: (state: RootState) => T): T {
  const state = useContext(StoreStateContext) as RootState | null;
  if (state == null) {
    throw new Error('useAppSelector must be used within StoreProvider');
  }
  return selector(state);
}
