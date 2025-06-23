import { createContext } from 'react';
import type { DataMartListContextValue } from './types.ts';

/**
 * React Context for the DataMartList feature.
 *
 * This context provides the state and dispatch function from the reducer
 * to the components within the DataMartListProvider.
 */
export const DataMartListContext = createContext<DataMartListContextValue | undefined>(undefined);
