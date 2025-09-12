import { useContext } from 'react';
import type { Dispatch } from '../types';
import { StoreDispatchContext, StoreStateContext } from './store-context';

export function useAppDispatch(): Dispatch {
  return useContext(StoreDispatchContext);
}

export function useAppSelector<T>(selector: (state: unknown) => T): T {
  const state = useContext(StoreStateContext);
  if (state == null) {
    throw new Error('useAppSelector must be used within StoreProvider');
  }
  return selector(state as unknown);
}
