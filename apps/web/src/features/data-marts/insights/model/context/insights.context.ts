import React, { createContext } from 'react';
import type { InsightsState } from '../types';
import type { InsightsAction } from '../reducer/actions.ts';

export interface InsightsContextValue {
  state: InsightsState;
  dispatch: React.Dispatch<InsightsAction>;
}

export const InsightsContext = createContext<InsightsContextValue | undefined>(undefined);
