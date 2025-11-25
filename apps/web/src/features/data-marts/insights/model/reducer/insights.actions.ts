import type { InsightEntity } from '../types';
import type { ApiError } from '../../../../../app/api';

export enum InsightsActionType {
  FETCH_INSIGHTS_START = 'FETCH_INSIGHTS_START',
  FETCH_INSIGHTS_SUCCESS = 'FETCH_INSIGHTS_SUCCESS',
  FETCH_INSIGHTS_ERROR = 'FETCH_INSIGHTS_ERROR',

  GET_INSIGHT_START = 'GET_INSIGHT_START',
  GET_INSIGHT_SUCCESS = 'GET_INSIGHT_SUCCESS',
  GET_INSIGHT_ERROR = 'GET_INSIGHT_ERROR',

  CREATE_INSIGHT_START = 'CREATE_INSIGHT_START',
  CREATE_INSIGHT_SUCCESS = 'CREATE_INSIGHT_SUCCESS',
  CREATE_INSIGHT_ERROR = 'CREATE_INSIGHT_ERROR',

  UPDATE_INSIGHT_START = 'UPDATE_INSIGHT_START',
  UPDATE_INSIGHT_SUCCESS = 'UPDATE_INSIGHT_SUCCESS',
  UPDATE_INSIGHT_ERROR = 'UPDATE_INSIGHT_ERROR',

  DELETE_INSIGHT_START = 'DELETE_INSIGHT_START',
  DELETE_INSIGHT_SUCCESS = 'DELETE_INSIGHT_SUCCESS',
  DELETE_INSIGHT_ERROR = 'DELETE_INSIGHT_ERROR',

  RUN_INSIGHT_START = 'RUN_INSIGHT_START',
  RUN_INSIGHT_START_ERROR = 'RUN_INSIGHT_START_ERROR',
  RUN_INSIGHT_STARTED = 'RUN_INSIGHT_STARTED',
  RUN_INSIGHT_SUCCESS = 'RUN_INSIGHT_SUCCESS',
  RUN_INSIGHT_ERROR = 'RUN_INSIGHT_ERROR',

  CLEAR_ERROR = 'CLEAR_ERROR',
}

export type InsightsAction =
  | { type: InsightsActionType.FETCH_INSIGHTS_START }
  | { type: InsightsActionType.FETCH_INSIGHTS_SUCCESS; payload: InsightEntity[] }
  | { type: InsightsActionType.FETCH_INSIGHTS_ERROR; payload: ApiError }
  | { type: InsightsActionType.GET_INSIGHT_START }
  | { type: InsightsActionType.GET_INSIGHT_SUCCESS; payload: InsightEntity }
  | { type: InsightsActionType.GET_INSIGHT_ERROR; payload: ApiError }
  | { type: InsightsActionType.CREATE_INSIGHT_START }
  | { type: InsightsActionType.CREATE_INSIGHT_SUCCESS; payload: InsightEntity }
  | { type: InsightsActionType.CREATE_INSIGHT_ERROR; payload: ApiError }
  | { type: InsightsActionType.UPDATE_INSIGHT_START }
  | { type: InsightsActionType.UPDATE_INSIGHT_SUCCESS; payload: InsightEntity }
  | { type: InsightsActionType.UPDATE_INSIGHT_ERROR; payload: ApiError }
  | { type: InsightsActionType.DELETE_INSIGHT_START }
  | { type: InsightsActionType.DELETE_INSIGHT_SUCCESS; payload: string }
  | { type: InsightsActionType.DELETE_INSIGHT_ERROR; payload: ApiError }
  | { type: InsightsActionType.RUN_INSIGHT_START }
  | { type: InsightsActionType.RUN_INSIGHT_STARTED; payload: { triggerId: string } }
  | { type: InsightsActionType.RUN_INSIGHT_START_ERROR; payload: ApiError }
  | { type: InsightsActionType.RUN_INSIGHT_SUCCESS; payload: { triggerId: string } }
  | { type: InsightsActionType.RUN_INSIGHT_ERROR; payload: ApiError }
  | { type: InsightsActionType.CLEAR_ERROR };
