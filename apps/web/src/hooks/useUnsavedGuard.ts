import { useCallback, useState } from 'react';

/**
 * Reusable helper to manage "unsaved changes" guard for closable sheets/dialogs.
 * It centralizes common logic used across multiple sheets:
 * - track dirty state
 * - intercept close and show confirmation dialog
 * - confirm close and reset state
 * - handle successful submit (reset + close)
 */
export function useUnsavedGuard(onClose: () => void) {
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const confirmClose = useCallback(() => {
    setShowUnsavedDialog(false);
    setIsDirty(false);
    onClose();
  }, [onClose]);

  const handleFormDirtyChange = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  const handleFormSubmitSuccess = useCallback(() => {
    setIsDirty(false);
    onClose();
  }, [onClose]);

  return {
    showUnsavedDialog,
    setShowUnsavedDialog,
    isDirty,
    handleClose,
    confirmClose,
    handleFormDirtyChange,
    handleFormSubmitSuccess,
  } as const;
}
