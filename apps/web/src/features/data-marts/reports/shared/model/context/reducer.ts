import { type ReportAction, ReportActionType } from './types.ts';
import type { DataMartReport } from '../types/data-mart-report.ts';
import { ReportStatusEnum } from '../../enums';

export interface ReportState {
  reports: DataMartReport[];
  currentReport: DataMartReport | null;
  loading: boolean;
  error: string | null;
  polledReportIds: string[];
}

export const initialReportState: ReportState = {
  reports: [],
  currentReport: null,
  loading: false,
  error: null,
  polledReportIds: [],
};

export function reducer(state: ReportState, action: ReportAction): ReportState {
  switch (action.type) {
    case ReportActionType.FETCH_REPORTS_START:
    case ReportActionType.FETCH_REPORT_START:
    case ReportActionType.CREATE_REPORT_START:
    case ReportActionType.UPDATE_REPORT_START:
    case ReportActionType.DELETE_REPORT_START:
      return {
        ...state,
        loading: true,
        error: null,
      };
    case ReportActionType.FETCH_REPORTS_SUCCESS:
      return {
        ...state,
        reports: action.payload,
        loading: false,
        error: null,
      };
    case ReportActionType.FETCH_REPORT_SUCCESS:
      return {
        ...state,
        currentReport: action.payload,
        loading: false,
        error: null,
      };
    case ReportActionType.CREATE_REPORT_SUCCESS:
      return {
        ...state,
        reports: [...state.reports, action.payload],
        loading: false,
        error: null,
      };
    case ReportActionType.UPDATE_REPORT_SUCCESS:
      return {
        ...state,
        currentReport: action.payload,
        reports: state.reports.map(report =>
          report.id === action.payload.id ? action.payload : report
        ),
        loading: false,
        error: null,
      };
    case ReportActionType.DELETE_REPORT_SUCCESS:
      return {
        ...state,
        reports: state.reports.filter(report => report.id !== action.payload),
        loading: false,
        error: null,
      };
    case ReportActionType.FETCH_REPORTS_ERROR:
    case ReportActionType.FETCH_REPORT_ERROR:
    case ReportActionType.CREATE_REPORT_ERROR:
    case ReportActionType.UPDATE_REPORT_ERROR:
    case ReportActionType.DELETE_REPORT_ERROR:
      return {
        ...state,
        loading: false,
        error: action.payload,
      };

    case ReportActionType.CLEAR_CURRENT_REPORT:
      return {
        ...state,
        currentReport: null,
      };
    case ReportActionType.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };
    case ReportActionType.START_POLLING_REPORT:
      return {
        ...state,
        polledReportIds: [...state.polledReportIds, action.payload],
      };
    case ReportActionType.STOP_POLLING_REPORT:
      return {
        ...state,
        polledReportIds: state.polledReportIds.filter(id => id !== action.payload),
      };

    case ReportActionType.STOP_ALL_POLLING:
      return {
        ...state,
        polledReportIds: [],
      };

    case ReportActionType.UPDATE_POLLED_REPORT: {
      const existingReport = state.reports.find(report => report.id === action.payload.id);
      if (
        (existingReport && action.payload.lastRunStatus !== ReportStatusEnum.RUNNING) ||
        existingReport?.lastRunStatus !== ReportStatusEnum.RUNNING
      ) {
        return {
          ...state,
          reports: state.reports.map(report =>
            report.id === action.payload.id
              ? { ...report, lastRunStatus: action.payload.lastRunStatus } // Update only the status
              : report
          ),
          polledReportIds: state.polledReportIds.filter(id => id !== action.payload.id),
        };
      }
      return state;
    }

    default:
      return state;
  }
}
