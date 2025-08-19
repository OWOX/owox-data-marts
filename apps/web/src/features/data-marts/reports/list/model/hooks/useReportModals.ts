import { useState } from 'react';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';

/**
 * Custom hook for managing report modal states
 * Handles add report modal, edit report modal, and the currently editing report
 * @returns Object containing modal states and handlers
 */
export function useReportModals() {
  const [isAddReportOpen, setIsAddReportOpen] = useState(false);
  const [isEditReportOpen, setIsEditReportOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<DataMartReport | null>(null);

  /**
   * Opens the add report modal
   */
  const handleAddReport = () => {
    setIsAddReportOpen(true);
  };

  /**
   * Opens the edit report modal with the specified report
   * @param report - The report to edit
   */
  const handleEditReport = (report: DataMartReport) => {
    setEditingReport(report);
    setIsEditReportOpen(true);
  };

  /**
   * Closes the add report modal
   */
  const handleCloseAddReport = () => {
    setIsAddReportOpen(false);
  };

  /**
   * Closes the edit report modal and clears the editing report
   */
  const handleCloseEditReport = () => {
    setIsEditReportOpen(false);
    setEditingReport(null);
  };

  return {
    isAddReportOpen,
    isEditReportOpen,
    editingReport,
    handleAddReport,
    handleEditReport,
    handleCloseAddReport,
    handleCloseEditReport,
  };
}
