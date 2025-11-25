import { useCallback } from 'react';
import { InsightsActionType } from '../reducer/insights.actions';
import { insightsService } from '../services';
import {
  mapInsightFromDto,
  mapInsightListFromDto,
  mapToCreateInsightRequest,
  mapToUpdateInsightRequest,
} from '../mappers/insights.mapper';
import { extractApiError } from '../../../../../app/api';
import { useDataMartContext } from '../../../edit/model';
import { trackEvent } from '../../../../../utils';
import toast from 'react-hot-toast';
import type { InsightEntity } from '../types';
import { useInsightsContext } from '../context/useInsightsContext.ts';
import { RequestStatus } from '../../../../../shared/types/request-status.ts';

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

  const getInsight = useCallback(
    async (id: string): Promise<InsightEntity | null> => {
      dispatch({ type: InsightsActionType.GET_INSIGHT_START });
      try {
        const response = await insightsService.getInsightById(dataMart.id, id);
        const insight = mapInsightFromDto(response);
        dispatch({ type: InsightsActionType.GET_INSIGHT_SUCCESS, payload: insight });
        return insight;
      } catch (error) {
        dispatch({ type: InsightsActionType.GET_INSIGHT_ERROR, payload: extractApiError(error) });
        throw error;
      }
    },
    [dataMart.id, dispatch]
  );

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

  const updateInsightTitle = useCallback(
    async (id: string, title: string) => {
      dispatch({ type: InsightsActionType.UPDATE_INSIGHT_START });
      try {
        const response = await insightsService.updateInsightTitle(dataMart.id, id, { title });
        const insight = mapInsightFromDto(response);
        const activeInsight = state.list.find(i => i.id === id) ?? state.activeInsight;
        const updatedInsight = activeInsight
          ? { ...insight, template: activeInsight.template }
          : insight;
        dispatch({ type: InsightsActionType.UPDATE_INSIGHT_SUCCESS, payload: updatedInsight });
        trackEvent({
          event: 'insight_title_updated',
          category: 'Insights',
          action: 'Update title',
          label: updatedInsight.id,
        });
        toast.success('Title updated');
        return updatedInsight;
      } catch (error) {
        dispatch({
          type: InsightsActionType.UPDATE_INSIGHT_ERROR,
          payload: extractApiError(error),
        });
        return null;
      }
    },
    [dataMart.id, dispatch, state.activeInsight, state.list]
  );

  const runInsight = useCallback(
    async (insightId: string) => {
      dispatch({ type: InsightsActionType.RUN_INSIGHT_START });
      try {
        const response = await insightsService.startInsightExecution(dataMart.id, insightId);
        dispatch({
          type: InsightsActionType.RUN_INSIGHT_STARTED,
          payload: { triggerId: response.triggerId },
        });
      } catch (error) {
        dispatch({
          type: InsightsActionType.RUN_INSIGHT_ERROR,
          payload: extractApiError(error),
        });
      }
    },
    [dispatch, dataMart.id]
  );

  const resetTriggerId = useCallback(() => {
    dispatch({ type: InsightsActionType.RUN_INSIGHT_SUCCESS, payload: { triggerId: '' } });
  }, [dispatch]);

  const setTriggerId = useCallback(
    (runId: string) => {
      dispatch({ type: InsightsActionType.RUN_INSIGHT_STARTED, payload: { triggerId: runId } });
    },
    [dispatch]
  );

  return {
    insights: state.list,
    activeInsight: state.activeInsight,
    listLoading: state.listLoadingStatus === RequestStatus.LOADING,
    insightLoading: state.activeInsightLoadingStatus === RequestStatus.LOADING,
    isRunning: state.executionStatus === RequestStatus.LOADING,
    triggerId: state.executionTriggerId,
    error: state.error,
    fetchInsights,
    getInsight,
    createInsight,
    updateInsight,
    updateInsightTitle,
    deleteInsight,
    runInsight,
    setTriggerId,
    resetTriggerId,
  };
}
