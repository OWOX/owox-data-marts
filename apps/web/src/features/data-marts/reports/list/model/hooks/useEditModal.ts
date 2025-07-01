import { useCallback, useState } from 'react';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';
import { ReportFormMode } from '../../../shared';

/**
 * Custom hook for managing edit modal state and functionality
 * @returns Object containing modal state and handlers
 */
export function useEditModal() {
  const [editId, setEditId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<ReportFormMode>(ReportFormMode.EDIT);

  /**
   * Opens modal in create mode
   */
  const handleAddReport = useCallback(() => {
    setEditMode(ReportFormMode.CREATE);
    setEditId(null);
    setEditOpen(true);
  }, []);

  /**
   * Opens modal in edit mode for specific report
   * @param id - Report ID to edit
   */
  const handleEditRow = useCallback((id: string) => {
    setEditId(id);
    setEditMode(ReportFormMode.EDIT);
    setEditOpen(true);
  }, []);

  /**
   * Closes the edit modal
   */
  const handleCloseEditForm = useCallback(() => {
    setEditOpen(false);
  }, []);

  /**
   * Gets the report to edit based on current state
   * @param items - Array of all reports
   * @returns Report to edit or undefined
   */
  const getEditReport = useCallback(
    (items: DataMartReport[]): DataMartReport | undefined => {
      return editMode === ReportFormMode.EDIT && editId
        ? items.find((item: DataMartReport) => item.id === editId)
        : undefined;
    },
    [editMode, editId]
  );

  return {
    // State
    editId,
    editOpen,
    editMode,
    // Handlers
    handleAddReport,
    handleEditRow,
    handleCloseEditForm,
    getEditReport,
  };
}
