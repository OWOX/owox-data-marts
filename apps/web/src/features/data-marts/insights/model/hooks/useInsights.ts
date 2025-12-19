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
import { isDataMartRunFinalStatus, isTaskFinalStatus } from '../../../shared';

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

  /**
   * Fetch a single insight without mutating the global insights state.
   * Useful for read-only flows (e.g., copying template into editor)
   * where we must not touch or overwrite the output field in the store.
   */
  const getInsightSilently = useCallback(
    async (id: string): Promise<InsightEntity | null> => {
      const response = await insightsService.getInsightById(dataMart.id, id);
      return mapInsightFromDto(response);
    },
    [dataMart.id]
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
          details: created.title,
          context: dataMart.id,
          value: dataMart.title,
        });
        toast.success('Insight created');
        return created;
      } catch (error) {
        const e = extractApiError(error);

        dispatch({
          type: InsightsActionType.CREATE_INSIGHT_ERROR,
          payload: e,
        });
        trackEvent({
          event: 'insight_error',
          category: 'Insights',
          action: 'CreateError',
          label: data.title,
          context: dataMart.id,
          error: e.message,
        });
        return null;
      }
    },
    [dataMart.id, dataMart.title, dispatch]
  );

  const createInsightWithAi = useCallback(async () => {
    dispatch({ type: InsightsActionType.CREATE_INSIGHT_START });
    try {
      const response = await insightsService.createInsightWithAi(dataMart.id);
      const created = mapInsightFromDto(response);
      dispatch({ type: InsightsActionType.CREATE_INSIGHT_SUCCESS, payload: created });
      trackEvent({
        event: 'insight_generated_with_ai',
        category: 'Insights',
        action: 'Generate with AI',
        label: created.id,
      });
      toast.success('Insight generated with AI');
      return created;
    } catch (error) {
      dispatch({
        type: InsightsActionType.CREATE_INSIGHT_ERROR,
        payload: extractApiError(error),
      });
      return null;
    }
  }, [dataMart.id, dispatch]);

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
          context: dataMart.id,
          details: updated.title,
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
          context: dataMart.id,
          details: updatedInsight.title,
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
        trackEvent({
          event: 'insight_run',
          category: 'Insights',
          action: 'Run',
          label: insightId,
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

  const ensureActiveRunPolling = useCallback(async () => {
    const insight = state.activeInsight;
    if (!insight || !dataMart.id) return;

    if (state.executionTriggerId) return;

    if (!insight.lastRun || isDataMartRunFinalStatus(insight.lastRun.status)) return;

    try {
      const res = await insightsService.getInsightRunTriggers(dataMart.id, insight.id, {
        skipLoadingIndicator: true,
      });
      const active = res.data
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
        .find(t => !isTaskFinalStatus(t.status));
      if (active?.id) {
        dispatch({ type: InsightsActionType.RUN_INSIGHT_START });
        dispatch({
          type: InsightsActionType.RUN_INSIGHT_STARTED,
          payload: { triggerId: active.id },
        });
      }
    } catch (error) {
      dispatch({ type: InsightsActionType.RUN_INSIGHT_ERROR, payload: extractApiError(error) });
    }
  }, [state.activeInsight, state.executionTriggerId, dataMart.id, dispatch]);

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
    getInsightSilently,
    createInsight,
    createInsightWithAi,
    updateInsight,
    updateInsightTitle,
    deleteInsight,
    runInsight,
    setTriggerId,
    resetTriggerId,
    ensureActiveRunPolling,
  };
}
