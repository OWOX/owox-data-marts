import React, { useReducer } from 'react';
import type { InsightsState } from '../types';
import { initialInsightsState } from '../types';
import { insightsReducer } from '../reducer/insights.reducer';
import { InsightsContext } from './insights.context';

interface InsightsProviderProps {
  children: React.ReactNode;
  initialState?: InsightsState;
}

export function InsightsProvider({ children, initialState }: InsightsProviderProps) {
  const [state, dispatch] = useReducer(insightsReducer, initialState ?? initialInsightsState);

  return (
    <InsightsContext.Provider value={{ state, dispatch }}>{children}</InsightsContext.Provider>
  );
}
