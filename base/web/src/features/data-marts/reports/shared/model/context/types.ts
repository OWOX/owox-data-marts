import React from 'react';
import type { ReportState } from './reducer.ts';
import type { DataMartReport } from '../types/data-mart-report.ts';
import type { DataDestinationResponseDto } from '../../../../../data-destination/shared/services/types';

export enum ReportActionType {
  FETCH_REPORTS_START = 'FETCH_REPORTS_START',
  FETCH_REPORTS_SUCCESS = 'FETCH_REPORTS_SUCCESS',
  FETCH_REPORTS_ERROR = 'FETCH_REPORTS_ERROR',

  FETCH_DESTINATIONS_START = 'FETCH_DESTINATIONS_START',
  FETCH_DESTINATIONS_SUCCESS = 'FETCH_DESTINATIONS_SUCCESS',
  FETCH_DESTINATIONS_ERROR = 'FETCH_DESTINATIONS_ERROR',

  FETCH_REPORT_START = 'FETCH_REPORT_START',
  FETCH_REPORT_SUCCESS = 'FETCH_REPORT_SUCCESS',
  FETCH_REPORT_ERROR = 'FETCH_REPORT_ERROR',
  CLEAR_CURRENT_REPORT = 'CLEAR_CURRENT_REPORT',

  CREATE_REPORT_START = 'CREATE_REPORT_START',
  CREATE_REPORT_SUCCESS = 'CREATE_REPORT_SUCCESS',
  CREATE_REPORT_ERROR = 'CREATE_REPORT_ERROR',

  UPDATE_REPORT_START = 'UPDATE_REPORT_START',
  UPDATE_REPORT_SUCCESS = 'UPDATE_REPORT_SUCCESS',
  UPDATE_REPORT_ERROR = 'UPDATE_REPORT_ERROR',

  DELETE_REPORT_START = 'DELETE_REPORT_START',
  DELETE_REPORT_SUCCESS = 'DELETE_REPORT_SUCCESS',
  DELETE_REPORT_ERROR = 'DELETE_REPORT_ERROR',

  START_POLLING_REPORT = 'START_POLLING_REPORT',
  STOP_POLLING_REPORT = 'STOP_POLLING_REPORT',
  UPDATE_POLLED_REPORT = 'UPDATE_POLLED_REPORT',
  STOP_ALL_POLLING = 'STOP_ALL_POLLING',

  CLEAR_ERROR = 'CLEAR_ERROR',
}

export type ReportAction =
  | { type: ReportActionType.FETCH_REPORTS_START }
  | { type: ReportActionType.FETCH_REPORTS_SUCCESS; payload: DataMartReport[] }
  | { type: ReportActionType.FETCH_REPORTS_ERROR; payload: string }
  | { type: ReportActionType.FETCH_DESTINATIONS_START }
  | { type: ReportActionType.FETCH_DESTINATIONS_SUCCESS; payload: DataDestinationResponseDto[] }
  | { type: ReportActionType.FETCH_DESTINATIONS_ERROR; payload: string }
  | { type: ReportActionType.FETCH_REPORT_START }
  | { type: ReportActionType.FETCH_REPORT_SUCCESS; payload: DataMartReport }
  | { type: ReportActionType.FETCH_REPORT_ERROR; payload: string }
  | { type: ReportActionType.CREATE_REPORT_START }
  | { type: ReportActionType.CREATE_REPORT_SUCCESS; payload: DataMartReport }
  | { type: ReportActionType.CREATE_REPORT_ERROR; payload: string }
  | { type: ReportActionType.UPDATE_REPORT_START }
  | { type: ReportActionType.UPDATE_REPORT_SUCCESS; payload: DataMartReport }
  | { type: ReportActionType.UPDATE_REPORT_ERROR; payload: string }
  | { type: ReportActionType.DELETE_REPORT_START }
  | { type: ReportActionType.DELETE_REPORT_SUCCESS; payload: string }
  | { type: ReportActionType.DELETE_REPORT_ERROR; payload: string }
  | { type: ReportActionType.START_POLLING_REPORT; payload: string }
  | { type: ReportActionType.STOP_POLLING_REPORT; payload: string }
  | { type: ReportActionType.UPDATE_POLLED_REPORT; payload: DataMartReport }
  | { type: ReportActionType.STOP_ALL_POLLING }
  | { type: ReportActionType.CLEAR_CURRENT_REPORT }
  | { type: ReportActionType.CLEAR_ERROR };

export interface ReportsContextValue {
  state: ReportState;
  dispatch: React.Dispatch<ReportAction>;
}
