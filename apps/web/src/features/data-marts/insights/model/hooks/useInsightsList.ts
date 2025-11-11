import { useMemo } from 'react';
import type { InsightEntity } from '../types';
import { useInsightsContext } from '../context/useInsightsContext.ts';

export function useInsightsList() {
  const { state } = useInsightsContext();

  const insights = useMemo<InsightEntity[]>(() => {
    return state.insights;
  }, [state.insights]);

  const isLoading = useMemo<boolean>(() => {
    return state.loading;
  }, [state.loading]);

  const error = useMemo(() => {
    return state.error;
  }, [state.error]);

  const hasInsights = useMemo<boolean>(() => {
    return insights.length > 0;
  }, [insights.length]);

  return {
    insights,
    isLoading,
    error,
    hasInsights,
  };
}
