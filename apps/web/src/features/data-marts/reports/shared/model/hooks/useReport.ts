import { useCallback, useEffect } from 'react';
import { reportService, reportStatusPollingService } from '../../services';
import { dataDestinationService } from '../../../../../data-destination';
import type { CreateReportRequestDto, UpdateReportRequestDto } from '../../services';
import type { ReportStatusPollingConfig } from '../../services';
import { useReportContext, ReportActionType } from '../context';
import { mapReportDtoToEntity } from '../mappers';
import toast from 'react-hot-toast';
import { trackEvent } from '../../../../../../utils/data-layer';

export function useReport() {
  const { state, dispatch } = useReportContext();

  const fetchDestinations = useCallback(async () => {
    dispatch({ type: ReportActionType.FETCH_DESTINATIONS_START });
    try {
      const destinations = await dataDestinationService.getDataDestinations();
      dispatch({ type: ReportActionType.FETCH_DESTINATIONS_SUCCESS, payload: destinations });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch destinations';
      dispatch({
        type: ReportActionType.FETCH_DESTINATIONS_ERROR,
        payload: message,
      });
      trackEvent({
        event: 'report_error',
        category: 'Report',
        action: 'DestinationsListError',
        label: message,
      });
    }
  }, [dispatch]);

  const fetchReports = useCallback(async () => {
    dispatch({ type: ReportActionType.FETCH_REPORTS_START });
    try {
      const reports = await reportService.getReportsByProject();
      const mappedReports = reports.map(mapReportDtoToEntity);
      dispatch({ type: ReportActionType.FETCH_REPORTS_SUCCESS, payload: mappedReports });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch reports';
      dispatch({
        type: ReportActionType.FETCH_REPORTS_ERROR,
        payload: message,
      });
      trackEvent({
        event: 'report_error',
        category: 'Report',
        action: 'ListError',
        label: message,
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
        const message = error instanceof Error ? error.message : 'Failed to fetch reports';
        dispatch({
          type: ReportActionType.FETCH_REPORTS_ERROR,
          payload: message,
        });
        trackEvent({
          event: 'report_error',
          category: 'Report',
          action: 'ListError',
          label: message,
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
        const message = error instanceof Error ? error.message : 'Failed to fetch report';
        dispatch({
          type: ReportActionType.FETCH_REPORT_ERROR,
          payload: message,
        });
        trackEvent({
          event: 'report_error',
          category: 'Report',
          action: 'GetError',
          label: message,
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
        trackEvent({
          event: 'report_created',
          category: 'Report',
          action: 'Create',
          label: mappedReport.dataDestination.type,
        });
        toast.success('Report created');
        return mappedReport;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create report';
        dispatch({
          type: ReportActionType.CREATE_REPORT_ERROR,
          payload: message,
        });
        trackEvent({
          event: 'report_error',
          category: 'Report',
          action: 'CreateError',
          label: data.destinationConfig.type,
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
        trackEvent({
          event: 'report_updated',
          category: 'Report',
          action: 'Update',
          label: mappedReport.dataDestination.type,
        });
        toast.success('Report updated');
        return mappedReport;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update report';
        dispatch({
          type: ReportActionType.UPDATE_REPORT_ERROR,
          payload: message,
        });
        trackEvent({
          event: 'report_error',
          category: 'Report',
          action: 'UpdateError',
          label: message,
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
        trackEvent({
          event: 'report_deleted',
          category: 'Report',
          action: 'Delete',
        });
        toast.success('Report deleted');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete report';
        dispatch({
          type: ReportActionType.DELETE_REPORT_ERROR,
          payload: message,
        });
        trackEvent({
          event: 'report_error',
          category: 'Report',
          action: 'DeleteError',
          label: message,
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
        trackEvent({
          event: 'report_run_started',
          category: 'Report',
          action: 'Run',
          label: id,
        });
        toast.success('Report run started');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to run report';
        trackEvent({
          event: 'report_error',
          category: 'Report',
          action: 'RunError',
          label: message,
        });
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
    destinations: state.destinations,
    reports: state.reports,
    currentReport: state.currentReport,
    loading: state.loading,
    error: state.error,
    polledReportIds: state.polledReportIds,
    fetchDestinations,
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
