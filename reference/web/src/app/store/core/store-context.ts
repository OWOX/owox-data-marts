import { createContext } from 'react';
import type { Dispatch } from '../types';

export const StoreStateContext = createContext<unknown>(null);
export const StoreDispatchContext = createContext<Dispatch>(() => undefined);
