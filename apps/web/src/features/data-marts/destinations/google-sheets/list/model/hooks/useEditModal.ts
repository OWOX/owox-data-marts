import { useState, useCallback } from 'react';
import type { GoogleSheetsReport } from '../../../shared/types';

/**
 * Custom hook for managing edit modal state and functionality
 * @returns Object containing modal state and handlers
 */
export function useEditModal() {
  const [editId, setEditId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<'edit' | 'create'>('edit');

  /**
   * Opens modal in create mode
   */
  const handleAddReport = useCallback(() => {
    setEditMode('create');
    setEditId(null);
    setEditOpen(true);
  }, []);

  /**
   * Opens modal in edit mode for specific report
   * @param id - Report ID to edit
   */
  const handleEditRow = useCallback((id: string) => {
    setEditId(id);
    setEditMode('edit');
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
    (items: GoogleSheetsReport[]): GoogleSheetsReport | undefined => {
      return editMode === 'edit' && editId
        ? items.find((item: GoogleSheetsReport) => item.id === editId)
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
