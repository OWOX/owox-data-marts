import { useContext } from 'react';
import { InsightsContext, type InsightsContextValue } from './insights.context';

export function useInsightsContext(): InsightsContextValue {
  const ctx = useContext(InsightsContext);
  if (!ctx) {
    throw new Error('useInsightsContext must be used within InsightsProvider');
  }
  return ctx;
}
