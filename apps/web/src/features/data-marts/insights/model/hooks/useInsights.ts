import { useCallback } from 'react';
import { InsightsActionType } from '../reducer/actions';
import { insightsService } from '../services/insights.service';
import {
  mapInsightFromDto,
  mapInsightListFromDto,
  mapToCreateInsightRequest,
  mapToUpdateInsightRequest,
} from '../mappers/insight.mapper';
import { extractApiError } from '../../../../../app/api';
import { useDataMartContext } from '../../../edit/model';
import { trackEvent } from '../../../../../utils';
import toast from 'react-hot-toast';
import type { InsightEntity } from '../types';
import { useInsightsContext } from '../context/useInsightsContext.ts';

export function useInsights() {
  const { state, dispatch } = useInsightsContext();
  const { dataMart } = useDataMartContext();

  if (!dataMart) {
    throw new Error('useInsights must be used within a DataMart context');
  }

  const fetchInsights = useCallback(async () => {
    dispatch({ type: InsightsActionType.FETCH_INSIGHTS_START });
    try {
      const response = await insightsService.getInsights(dataMart.id);
      const insights = mapInsightListFromDto(response);
      dispatch({ type: InsightsActionType.FETCH_INSIGHTS_SUCCESS, payload: insights });
    } catch (error) {
      dispatch({ type: InsightsActionType.FETCH_INSIGHTS_ERROR, payload: extractApiError(error) });
      throw error;
    }
  }, [dataMart.id, dispatch]);

  const createInsight = useCallback(
    async (data: { title: string; template?: string | null }) => {
      dispatch({ type: InsightsActionType.CREATE_INSIGHT_START });
      try {
        const request = mapToCreateInsightRequest(data);
        const response = await insightsService.createInsight(dataMart.id, request);
        const created = mapInsightFromDto(response);
        dispatch({ type: InsightsActionType.CREATE_INSIGHT_SUCCESS, payload: created });
        trackEvent({
          event: 'insight_created',
          category: 'Insights',
          action: 'Create',
          label: created.id,
        });
        toast.success('Insight created');
        return created;
      } catch (error) {
        dispatch({
          type: InsightsActionType.CREATE_INSIGHT_ERROR,
          payload: extractApiError(error),
        });
        return null;
      }
    },
    [dataMart.id, dispatch]
  );

  const updateInsight = useCallback(
    async (id: string, data: { title: string; template?: string | null }) => {
      dispatch({ type: InsightsActionType.UPDATE_INSIGHT_START });
      try {
        const request = mapToUpdateInsightRequest(data);
        const response = await insightsService.updateInsight(dataMart.id, id, request);
        const updated = mapInsightFromDto(response);
        dispatch({ type: InsightsActionType.UPDATE_INSIGHT_SUCCESS, payload: updated });
        trackEvent({
          event: 'insight_updated',
          category: 'Insights',
          action: 'Update',
          label: updated.id,
        });
        toast.success('Insight updated');
        return updated;
      } catch (error) {
        dispatch({
          type: InsightsActionType.UPDATE_INSIGHT_ERROR,
          payload: extractApiError(error),
        });
        return null;
      }
    },
    [dataMart.id, dispatch]
  );

  const deleteInsight = useCallback(
    async (id: InsightEntity['id']) => {
      dispatch({ type: InsightsActionType.DELETE_INSIGHT_START });
      try {
        await insightsService.deleteInsight(dataMart.id, id);
        dispatch({ type: InsightsActionType.DELETE_INSIGHT_SUCCESS, payload: id });
        trackEvent({ event: 'insight_deleted', category: 'Insights', action: 'Delete', label: id });
        toast.success('Insight deleted');
      } catch (error) {
        dispatch({
          type: InsightsActionType.DELETE_INSIGHT_ERROR,
          payload: extractApiError(error),
        });
        throw error;
      }
    },
    [dataMart.id, dispatch]
  );

  return {
    insights: state.insights,
    loading: state.loading,
    error: state.error,
    fetchInsights,
    createInsight,
    updateInsight,
    deleteInsight,
  };
}
