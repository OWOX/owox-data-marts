import { useMemo } from 'react';
import type { InsightEntity } from '../types';
import { useInsightsContext } from '../context/useInsightsContext.ts';
import { RequestStatus } from '../../../../../shared/types/request-status.ts';

export function useInsightsList() {
  const { state } = useInsightsContext();

  const insights = useMemo<InsightEntity[]>(() => {
    return state.list;
  }, [state.list]);

  const isLoading = useMemo<boolean>(() => {
    return state.listLoadingStatus === RequestStatus.LOADING;
  }, [state.listLoadingStatus]);

  const isLoaded = useMemo<boolean>(() => {
    return (
      state.listLoadingStatus === RequestStatus.LOADED ||
      state.listLoadingStatus === RequestStatus.ERROR
    );
  }, [state.listLoadingStatus]);

  const error = useMemo(() => {
    return state.error;
  }, [state.error]);

  const hasInsights = useMemo<boolean>(() => {
    return insights.length > 0;
  }, [insights.length]);

  return {
    insights,
    isLoading,
    isLoaded,
    error,
    hasInsights,
  };
}
