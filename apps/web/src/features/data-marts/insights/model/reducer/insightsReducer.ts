import type { InsightsState } from '../types';
import { initialInsightsState } from '../types';
import type { InsightsAction } from './actions';
import { InsightsActionType } from './actions';

export { initialInsightsState };

export function insightsReducer(state: InsightsState, action: InsightsAction): InsightsState {
  switch (action.type) {
    case InsightsActionType.FETCH_INSIGHTS_START:
      return {
        ...state,
        loading: true,
        error: null,
      };
    case InsightsActionType.CREATE_INSIGHT_START:
    case InsightsActionType.UPDATE_INSIGHT_START:
      return {
        ...state,
        error: null,
      };
    case InsightsActionType.DELETE_INSIGHT_START:
      return {
        ...state,
        loading: true,
        error: null,
      };
    case InsightsActionType.FETCH_INSIGHTS_SUCCESS:
      return {
        ...state,
        insights: action.payload,
        loading: false,
        error: null,
      };
    case InsightsActionType.CREATE_INSIGHT_SUCCESS:
      return {
        ...state,
        insights: [...state.insights, action.payload],
        loading: false,
        error: null,
      };
    case InsightsActionType.UPDATE_INSIGHT_SUCCESS:
      return {
        ...state,
        insights: state.insights.map(i => (i.id === action.payload.id ? action.payload : i)),
        loading: false,
        error: null,
      };
    case InsightsActionType.DELETE_INSIGHT_SUCCESS:
      return {
        ...state,
        insights: state.insights.filter(i => i.id !== action.payload),
        loading: false,
        error: null,
      };
    case InsightsActionType.FETCH_INSIGHTS_ERROR:
    case InsightsActionType.CREATE_INSIGHT_ERROR:
    case InsightsActionType.UPDATE_INSIGHT_ERROR:
    case InsightsActionType.DELETE_INSIGHT_ERROR:
      return {
        ...state,
        loading: false,
        error: action.payload,
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
