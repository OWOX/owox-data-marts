import type { InsightsState } from '../types';
import { RequestStatus } from '../../../../../shared/types/request-status.ts';
import { type InsightsAction, InsightsActionType } from './insights.actions.ts';

export function insightsReducer(state: InsightsState, action: InsightsAction): InsightsState {
  switch (action.type) {
    case InsightsActionType.FETCH_INSIGHTS_START:
      return {
        ...state,
        listLoadingStatus: RequestStatus.LOADING,
        error: null,
      };
    case InsightsActionType.GET_INSIGHT_START:
      return {
        ...state,
        activeInsightLoadingStatus: RequestStatus.LOADING,
        error: null,
      };
    case InsightsActionType.CREATE_INSIGHT_START:
      return {
        ...state,
        activeInsightLoadingStatus: RequestStatus.LOADING,
        error: null,
      };
    case InsightsActionType.UPDATE_INSIGHT_START:
      return {
        ...state,
        error: null,
      };
    case InsightsActionType.DELETE_INSIGHT_START:
      return {
        ...state,
        listLoadingStatus: RequestStatus.LOADING,
        error: null,
      };
    case InsightsActionType.FETCH_INSIGHTS_SUCCESS:
      return {
        ...state,
        list: action.payload,
        listLoadingStatus: RequestStatus.LOADED,
        error: null,
      };
    case InsightsActionType.GET_INSIGHT_SUCCESS:
      return {
        ...state,
        activeInsight: action.payload,
        activeInsightLoadingStatus: RequestStatus.LOADED,
        error: null,
      };
    case InsightsActionType.CREATE_INSIGHT_SUCCESS:
      return {
        ...state,
        list: [...state.list, action.payload],
        listLoadingStatus: RequestStatus.LOADED,
        activeInsightLoadingStatus: RequestStatus.LOADED,
        error: null,
      };
    case InsightsActionType.UPDATE_INSIGHT_SUCCESS:
      return {
        ...state,
        list: state.list.map(i => (i.id === action.payload.id ? action.payload : i)),
        activeInsight:
          state.activeInsight?.id === action.payload.id ? action.payload : state.activeInsight,
        listLoadingStatus: RequestStatus.LOADED,
        error: null,
      };
    case InsightsActionType.DELETE_INSIGHT_SUCCESS:
      return {
        ...state,
        list: state.list.filter(i => i.id !== action.payload),
        activeInsight: state.activeInsight?.id === action.payload ? null : state.activeInsight,
        listLoadingStatus: RequestStatus.LOADED,
        error: null,
      };
    case InsightsActionType.FETCH_INSIGHTS_ERROR:
      return {
        ...state,
        listLoadingStatus: RequestStatus.ERROR,
        error: action.payload,
      };
    case InsightsActionType.GET_INSIGHT_ERROR:
      return {
        ...state,
        activeInsightLoadingStatus: RequestStatus.ERROR,
        error: action.payload,
      };
    case InsightsActionType.CREATE_INSIGHT_ERROR:
      return {
        ...state,
        listLoadingStatus: RequestStatus.ERROR,
        activeInsightLoadingStatus: RequestStatus.ERROR,
        error: action.payload,
      };
    case InsightsActionType.UPDATE_INSIGHT_ERROR:
    case InsightsActionType.DELETE_INSIGHT_ERROR:
      return {
        ...state,
        listLoadingStatus: RequestStatus.ERROR,
        error: action.payload,
      };
    case InsightsActionType.RUN_INSIGHT_START:
      return {
        ...state,
        executionStatus: RequestStatus.LOADING,
        error: null,
      };
    case InsightsActionType.RUN_INSIGHT_STARTED:
      return {
        ...state,
        executionTriggerId: action.payload.triggerId,
        error: null,
      };
    case InsightsActionType.RUN_INSIGHT_SUCCESS:
      return {
        ...state,
        executionStatus: RequestStatus.LOADED,
        executionTriggerId: null,
        error: null,
      };
    case InsightsActionType.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };
    default:
      return state;
  }
}
