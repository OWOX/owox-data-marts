import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUnsavedGuard } from './useUnsavedGuard';

/**
 * Tests for the "unsaved changes" guard: a dirty form must intercept close and show the
 * confirmation dialog instead of closing immediately. The re-open loop the dialog used to
 * trigger is now prevented structurally by rendering the dialog inside `SheetContent`
 * (a nested Radix dismissable layer), not by this hook.
 */
describe('useUnsavedGuard', () => {
  describe('dirty guard flow', () => {
    it('shows the confirmation dialog instead of closing when the form is dirty', () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useUnsavedGuard(onClose));

      act(() => {
        result.current.handleFormDirtyChange(true);
      });
      act(() => {
        result.current.handleClose();
      });

      expect(result.current.showUnsavedDialog).toBe(true);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes immediately when the form is not dirty', () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useUnsavedGuard(onClose));

      act(() => {
        result.current.handleClose();
      });

      expect(result.current.showUnsavedDialog).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('confirmClose hides the dialog, clears dirty state and closes', () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useUnsavedGuard(onClose));

      act(() => {
        result.current.handleFormDirtyChange(true);
      });
      act(() => {
        result.current.handleClose();
      });
      act(() => {
        result.current.confirmClose();
      });

      expect(result.current.showUnsavedDialog).toBe(false);
      expect(result.current.isDirty).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('handleFormSubmitSuccess clears dirty state and closes without the dialog', () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useUnsavedGuard(onClose));

      act(() => {
        result.current.handleFormDirtyChange(true);
      });
      act(() => {
        result.current.handleFormSubmitSuccess();
      });

      expect(result.current.isDirty).toBe(false);
      expect(result.current.showUnsavedDialog).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
