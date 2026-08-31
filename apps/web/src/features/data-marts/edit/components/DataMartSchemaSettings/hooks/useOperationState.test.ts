import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useOperationState } from './useOperationState';

describe('useOperationState', () => {
  // Documents the mechanism the bug lived in: `error` here is the shared context-level error,
  // and a rejected schema save deliberately never sets it (see reducer.ts's
  // UPDATE_DATA_MART_SCHEMA_ERROR case — that shared field is also read by DataMartDetails for a
  // 403 → <NoAccess/> guard, so a schema-save rejection must not populate it). Left to this
  // effect alone, that means every failed schema save reads as 'success' once `isLoading` catches
  // up to false.
  it('without failSaveOperation, a failed save is misread as success once isLoading catches up', () => {
    const { result, rerender } = renderHook(
      ({ isLoading, error }: { isLoading: boolean; error: unknown }) =>
        useOperationState(isLoading, error),
      { initialProps: { isLoading: false, error: null as unknown } }
    );

    act(() => {
      result.current.startSaveOperation();
    });
    rerender({ isLoading: true, error: null });
    rerender({ isLoading: false, error: null });

    expect(result.current.operationStatus).toBe('success');
  });

  it('failSaveOperation marks the save as failed immediately, from the rejection the caller already holds', () => {
    const { result, rerender } = renderHook(
      ({ isLoading, error }: { isLoading: boolean; error: unknown }) =>
        useOperationState(isLoading, error),
      { initialProps: { isLoading: false, error: null as unknown } }
    );

    act(() => {
      result.current.startSaveOperation();
    });
    rerender({ isLoading: true, error: null });

    act(() => {
      result.current.failSaveOperation();
    });
    expect(result.current.operationStatus).toBe('error');
  });

  // The fix's whole point: once failSaveOperation has run, the isLoading-watching effect above
  // must not later overwrite 'error' back to 'success' when `isLoading` finally does flip to
  // false with `error` still null (exactly what happens on a real schema-save rejection).
  it('failSaveOperation prevents the later isLoading:false catch-up from reverting to success', () => {
    const { result, rerender } = renderHook(
      ({ isLoading, error }: { isLoading: boolean; error: unknown }) =>
        useOperationState(isLoading, error),
      { initialProps: { isLoading: false, error: null as unknown } }
    );

    act(() => {
      result.current.startSaveOperation();
    });
    rerender({ isLoading: true, error: null });
    act(() => {
      result.current.failSaveOperation();
    });
    expect(result.current.operationStatus).toBe('error');

    // The save's own isLoading:false eventually arrives, same as it always would.
    rerender({ isLoading: false, error: null });

    expect(result.current.operationStatus).toBe('error');
  });

  it('a successful save still reports success normally', () => {
    const { result, rerender } = renderHook(
      ({ isLoading, error }: { isLoading: boolean; error: unknown }) =>
        useOperationState(isLoading, error),
      { initialProps: { isLoading: false, error: null as unknown } }
    );

    act(() => {
      result.current.startSaveOperation();
    });
    rerender({ isLoading: true, error: null });
    rerender({ isLoading: false, error: null });

    expect(result.current.operationStatus).toBe('success');
  });
});
