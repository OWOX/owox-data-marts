import { useState } from 'react';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { ReportFormMode } from '../../../shared';

/**
 * Custom hook for managing report modal states
 * - Handles opening/closing of the modal
 * - Manages "create" and "edit" modes
 * - Stores the currently edited report (if any)
 */
export function useReportModals() {
  // Controls whether the modal is open
  const [isOpen, setIsOpen] = useState(false);

  // Defines the current modal mode: CREATE or EDIT
  const [mode, setMode] = useState<ReportFormMode>(ReportFormMode.CREATE);

  // Stores the report being edited (null when creating a new one)
  const [editingReport, setEditingReport] = useState<DataMartReport | null>(null);

  /**
   * Opens the modal in CREATE mode
   */
  const handleAddReport = () => {
    setMode(ReportFormMode.CREATE);
    setEditingReport(null);
    setIsOpen(true);
  };

  /**
   * Opens the modal in EDIT mode for a specific report
   */
  const handleEditReport = (report: DataMartReport) => {
    setMode(ReportFormMode.EDIT);
    setEditingReport(report);
    setIsOpen(true);
  };

  /**
   * Closes the modal and resets the editing report
   */
  const handleCloseModal = () => {
    setIsOpen(false);
    setEditingReport(null);
  };

  return {
    isOpen,
    mode,
    editingReport,
    handleAddReport,
    handleEditReport,
    handleCloseModal,
  };
}
