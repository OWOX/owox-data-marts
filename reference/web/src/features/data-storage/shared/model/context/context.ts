import { createContext } from 'react';
import type { DataStorageContextValue } from './types.ts';

/**
 * React Context for the DataStorage feature.
 *
 * This context provides the state and dispatch function from the reducer
 * to the components within the DataStorageProvider.
 */
export const DataStorageContext = createContext<DataStorageContextValue | undefined>(undefined);
