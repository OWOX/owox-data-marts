import { createContext } from 'react';
import type { ReportsContextValue } from './types.ts';

/**
 * React Context for the Reports feature.
 *
 * This context provides the state and dispatch function from the reducer
 * to the components within the ReportProvider.
 */
export const ReportsContext = createContext<ReportsContextValue | undefined>(undefined);
