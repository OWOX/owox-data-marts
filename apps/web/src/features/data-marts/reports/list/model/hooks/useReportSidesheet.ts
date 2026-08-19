import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { ReportFormMode } from '../../../shared';
import { trackEvent } from '../../../../../../utils/data-layer';
import { useUrlParam } from '../../../../../../shared/hooks';

/**
 * Name of the query parameter that deep-links to an open report sidesheet.
 */
export const REPORT_ID_URL_PARAM = 'reportId';

interface UseReportSidesheetOptions {
  /**
   * Enables deep linking via the `reportId` query parameter.
   * When provided, the hook keeps the parameter in sync with the open sidesheet
   * and auto-opens the sidesheet for a report from this list that matches the
   * parameter on initial load.
   */
  deepLinkReports?: DataMartReport[];
}

/**
 * Custom hook for managing report modal states
 * - Handles opening/closing of the modal
 * - Manages "create" and "edit" modes
 * - Stores the currently edited report (if any)
 * - Optionally syncs the edited report id with the URL (deep linking)
 */
export function useReportSidesheet({ deepLinkReports }: UseReportSidesheetOptions = {}) {
  // Controls whether the modal is open
  const [isOpen, setIsOpen] = useState(false);

  // Defines the current modal mode: CREATE or EDIT
  const [mode, setMode] = useState<ReportFormMode>(ReportFormMode.CREATE);

  // Stores the report being edited (null when creating a new one)
  const [editingReport, setEditingReport] = useState<DataMartReport | null>(null);

  const isDeepLinkEnabled = deepLinkReports !== undefined;
  const {
    value: deepLinkReportId,
    setParam: setReportIdParam,
    removeParam: removeReportIdParam,
  } = useUrlParam(REPORT_ID_URL_PARAM);

  /**
   * Opens the modal in CREATE mode
   * Memoized to prevent unnecessary re-renders of child components
   */
  const handleAddReport = useCallback(() => {
    setMode(ReportFormMode.CREATE);
    setEditingReport(null);
    setIsOpen(true);
    trackEvent({
      event: 'report_open',
      category: 'Report',
      action: 'CreateReport',
      label: 'ReportForm',
    });
  }, []);

  /**
   * Opens the modal in EDIT mode for a specific report
   * Memoized to prevent unnecessary re-renders of child components
   */
  const handleEditReport = useCallback(
    (report: DataMartReport) => {
      setMode(ReportFormMode.EDIT);
      setEditingReport(report);
      setIsOpen(true);
      if (isDeepLinkEnabled) {
        setReportIdParam(report.id);
      }
      trackEvent({
        event: 'report_open',
        category: 'Report',
        action: 'EditReport',
        label: report.dataDestination.type,
      });
    },
    [isDeepLinkEnabled, setReportIdParam]
  );

  /**
   * Closes the modal and resets the editing report
   * Memoized to prevent unnecessary re-renders of child components
   */
  // Param removal goes through a router transition, so for a few renders after a
  // close the sidesheet is already closed while the param still reads the old value.
  // Remember the value being removed so the auto-open effect does not re-open from it.
  const justClosedReportIdRef = useRef<string | null>(null);

  const handleCloseModal = useCallback(() => {
    setIsOpen(false);
    setEditingReport(null);
    // Remove the param only when this sidesheet instance owns it — every card on
    // the page shares the param, and closing an unrelated (e.g. CREATE-mode) sheet
    // must not clobber a deep link another card has not resolved yet.
    if (isDeepLinkEnabled && editingReport?.id === deepLinkReportId) {
      justClosedReportIdRef.current = deepLinkReportId;
      removeReportIdParam();
    }
    trackEvent({
      event: 'report_close',
      category: 'Report',
      action: mode === ReportFormMode.EDIT ? 'Edit' : 'Create',
      label: 'ReportForm',
    });
  }, [isDeepLinkEnabled, mode, editingReport, deepLinkReportId, removeReportIdParam]);

  // Auto-open the sidesheet for a deep-linked report once it appears in the list.
  // Guarded by isOpen (not a one-shot ref): a manual open sets the param itself, so
  // the effect must not re-fire handleEditReport for it, while a new param arriving
  // after a close must still open — both fall out of the isOpen check.
  useEffect(() => {
    if (!isDeepLinkEnabled) {
      return;
    }
    if (!deepLinkReportId) {
      justClosedReportIdRef.current = null;
      return;
    }
    if (isOpen || deepLinkReportId === justClosedReportIdRef.current) {
      return;
    }
    const report = deepLinkReports.find(item => item.id === deepLinkReportId);
    if (report) {
      handleEditReport(report);
    }
  }, [isDeepLinkEnabled, deepLinkReports, deepLinkReportId, isOpen, handleEditReport]);

  return {
    isOpen,
    mode,
    editingReport,
    handleAddReport,
    handleEditReport,
    handleCloseModal,
  };
}
