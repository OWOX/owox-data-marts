import { createContext } from 'react';
import type { DataDestinationContextValue } from './types.ts';

/**
 * React Context for the DataDestination feature.
 *
 * This context provides the state and dispatch function from the reducer
 * to the components within the DataDestinationProvider.
 */
export const DataDestinationContext = createContext<DataDestinationContextValue | undefined>(
  undefined
);
