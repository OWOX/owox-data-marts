import { useCallback, useEffect } from 'react';
import type { DataMartReport } from '../types/data-mart-report';
import { type ReportResponseDto, reportService, reportStatusPollingService } from '../../services';
import type { CreateReportRequestDto, UpdateReportRequestDto } from '../../services';
import type { ReportStatusPollingConfig } from '../../services';
import { mapDataDestinationFromDto } from '../../../../../data-destination/shared/model/mappers/data-destination.mapper';
import { useReportContext, ReportActionType } from '../context';

function mapReportDtoToEntity(reportDto: ReportResponseDto): DataMartReport {
  return {
    id: reportDto.id,
    title: reportDto.title,
    dataMart: { id: reportDto.dataMart.id },
    dataDestination: mapDataDestinationFromDto(reportDto.dataDestinationAccess),
    destinationConfig: {
      type: reportDto.destinationConfig.type,
      spreadsheetId: reportDto.destinationConfig.spreadsheetId,
      sheetId: reportDto.destinationConfig.sheetId.toString(),
    },
    lastRunDate: reportDto.lastRunAt ? new Date(reportDto.lastRunAt) : null,
    lastRunStatus: reportDto.lastRunStatus,
    lastRunError: reportDto.lastRunError,
    runsCount: reportDto.runsCount,
    createdAt: new Date(reportDto.createdAt),
    modifiedAt: new Date(reportDto.modifiedAt),
  };
}

export function useReport() {
  const { state, dispatch } = useReportContext();

  const fetchReports = useCallback(async () => {
    dispatch({ type: ReportActionType.FETCH_REPORTS_START });
    try {
      const reports = await reportService.getReportsByProject();
      const mappedReports = reports.map(mapReportDtoToEntity);
      dispatch({ type: ReportActionType.FETCH_REPORTS_SUCCESS, payload: mappedReports });
    } catch (error) {
      dispatch({
        type: ReportActionType.FETCH_REPORTS_ERROR,
        payload: error instanceof Error ? error.message : 'Failed to fetch reports',
      });
    }
  }, [dispatch]);

  const fetchReportsByDataMartId = useCallback(
    async (dataMartId: string) => {
      dispatch({ type: ReportActionType.FETCH_REPORTS_START });
      try {
        const reports = await reportService.getReportsByDataMartId(dataMartId);
        const mappedReports = reports.map(mapReportDtoToEntity);
        dispatch({ type: ReportActionType.FETCH_REPORTS_SUCCESS, payload: mappedReports });
      } catch (error) {
        dispatch({
          type: ReportActionType.FETCH_REPORTS_ERROR,
          payload: error instanceof Error ? error.message : 'Failed to fetch reports',
        });
      }
    },
    [dispatch]
  );

  const fetchReportById = useCallback(
    async (id: string) => {
      dispatch({ type: ReportActionType.FETCH_REPORT_START });
      try {
        const report = await reportService.getReportById(id);
        const mappedReport = mapReportDtoToEntity(report);
        dispatch({ type: ReportActionType.FETCH_REPORT_SUCCESS, payload: mappedReport });
      } catch (error) {
        dispatch({
          type: ReportActionType.FETCH_REPORT_ERROR,
          payload: error instanceof Error ? error.message : 'Failed to fetch report',
        });
      }
    },
    [dispatch]
  );

  const createReport = useCallback(
    async (data: CreateReportRequestDto) => {
      dispatch({ type: ReportActionType.CREATE_REPORT_START });
      try {
        const report = await reportService.createReport(data);
        const mappedReport = mapReportDtoToEntity(report);
        dispatch({ type: ReportActionType.CREATE_REPORT_SUCCESS, payload: mappedReport });
        return mappedReport;
      } catch (error) {
        dispatch({
          type: ReportActionType.CREATE_REPORT_ERROR,
          payload: error instanceof Error ? error.message : 'Failed to сreate report',
        });
        return null;
      }
    },
    [dispatch]
  );

  const updateReport = useCallback(
    async (id: string, data: UpdateReportRequestDto) => {
      dispatch({ type: ReportActionType.UPDATE_REPORT_START });
      try {
        const report = await reportService.updateReport(id, data);
        const mappedReport = mapReportDtoToEntity(report);
        dispatch({ type: ReportActionType.UPDATE_REPORT_SUCCESS, payload: mappedReport });
        return mappedReport;
      } catch (error) {
        dispatch({
          type: ReportActionType.UPDATE_REPORT_ERROR,
          payload: error instanceof Error ? error.message : 'Failed to update report',
        });
        return null;
      }
    },
    [dispatch]
  );

  const deleteReport = useCallback(
    async (id: string) => {
      dispatch({ type: ReportActionType.DELETE_REPORT_START });
      try {
        await reportService.deleteReport(id);
        dispatch({ type: ReportActionType.DELETE_REPORT_SUCCESS, payload: id });
      } catch (error) {
        dispatch({
          type: ReportActionType.DELETE_REPORT_ERROR,
          payload: error instanceof Error ? error.message : 'Failed to delete report',
        });
      }
    },
    [dispatch]
  );

  const clearCurrentReport = useCallback(() => {
    dispatch({ type: ReportActionType.CLEAR_CURRENT_REPORT });
  }, [dispatch]);

  const clearError = useCallback(() => {
    dispatch({ type: ReportActionType.CLEAR_ERROR });
  }, [dispatch]);

  const stopPollingReport = useCallback(
    (reportId: string) => {
      reportStatusPollingService.stopPolling(reportId);
      dispatch({ type: ReportActionType.STOP_POLLING_REPORT, payload: reportId });
    },
    [dispatch]
  );

  const startPollingReport = useCallback(
    (reportId: string) => {
      // If we're already polling this report, stop polling first
      if (state.polledReportIds.includes(reportId)) {
        stopPollingReport(reportId);
      }

      // Dispatch action to add report to polledReportIds
      dispatch({ type: ReportActionType.START_POLLING_REPORT, payload: reportId });

      reportStatusPollingService.startPolling(reportId, reportDto => {
        const mappedReport = mapReportDtoToEntity(reportDto);

        // Dispatch action to update the report in state
        // The reducer will handle checking if the status has changed
        dispatch({ type: ReportActionType.UPDATE_POLLED_REPORT, payload: mappedReport });
      });
    },
    [dispatch, state.polledReportIds, stopPollingReport]
  );

  const stopAllPolling = useCallback(() => {
    reportStatusPollingService.stopAllPolling();

    // Dispatch action to clear all polled report IDs
    dispatch({ type: ReportActionType.STOP_ALL_POLLING });
  }, [dispatch]);

  const setPollingConfig = useCallback((config: Partial<ReportStatusPollingConfig>) => {
    reportStatusPollingService.setConfig(config);
  }, []);

  const runReport = useCallback(
    async (id: string) => {
      try {
        // Stop any existing polling for this report
        stopPollingReport(id);

        await reportService.runReport(id);
        // Fetch the report to update its status
        await fetchReportById(id);
        // Start polling for status updates
        startPollingReport(id);
      } catch (error) {
        console.error('Failed to run report:', error);
      }
    },
    [fetchReportById, startPollingReport, stopPollingReport]
  );

  // Clean up polling when component unmounts
  useEffect(() => {
    return () => {
      stopAllPolling();
    };
  }, [stopAllPolling]);

  return {
    reports: state.reports,
    currentReport: state.currentReport,
    loading: state.loading,
    error: state.error,
    polledReportIds: state.polledReportIds,
    fetchReports,
    fetchReportsByDataMartId,
    fetchReportById,
    createReport,
    updateReport,
    deleteReport,
    runReport,
    startPollingReport,
    stopPollingReport,
    stopAllPolling,
    setPollingConfig,
    clearCurrentReport,
    clearError,
  };
}
