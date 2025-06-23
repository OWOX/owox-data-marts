import { createContext } from 'react';
import type { DataMartContextType } from './types.ts';

/**
 * React Context for the DataMart feature.
 *
 * This context provides state and functions to manage a single data mart.
 */
const DataMartContext = createContext<DataMartContextType | undefined>(undefined);

export { DataMartContext };
