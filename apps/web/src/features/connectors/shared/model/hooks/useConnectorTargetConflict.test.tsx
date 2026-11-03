import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataMartService } from '../../../../data-marts/shared/services/data-mart.service';
import { useConnectorTargetConflict } from './useConnectorTargetConflict';

const valid = { fullyQualifiedName: 'ds.plan', isValid: true };
const hit = { conflict: true, dataMart: { id: 'dm-2', title: 'Plan 2026' } };

describe('useConnectorTargetConflict', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('asks after the debounce for a valid target and returns the answer', async () => {
    const spy = vi.spyOn(dataMartService, 'getConnectorTargetConflict').mockResolvedValue(hit);
    const { result } = renderHook(() => useConnectorTargetConflict('dm-1', valid));

    expect(spy).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(spy).toHaveBeenCalledWith('dm-1', 'ds.plan');
    expect(result.current).toEqual(hit);
  });

  it('skips an invalid target or a form outside a Data Mart', async () => {
    const spy = vi.spyOn(dataMartService, 'getConnectorTargetConflict').mockResolvedValue(hit);
    const invalid = renderHook(() =>
      useConnectorTargetConflict('dm-1', { fullyQualifiedName: 'ds.1', isValid: false })
    );
    const outside = renderHook(() => useConnectorTargetConflict(undefined, valid));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(spy).not.toHaveBeenCalled();
    expect(invalid.result.current).toBeNull();
    expect(outside.result.current).toBeNull();
  });

  it('returns null when the request fails', async () => {
    vi.spyOn(dataMartService, 'getConnectorTargetConflict').mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useConnectorTargetConflict('dm-1', valid));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current).toBeNull();
  });

  it('drops a stale answer', async () => {
    let resolveFirst!: (v: typeof hit) => void;
    const spy = vi
      .spyOn(dataMartService, 'getConnectorTargetConflict')
      .mockImplementationOnce(() => new Promise(resolve => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ conflict: false, dataMart: null });
    const { result, rerender } = renderHook(
      ({ target }) => useConnectorTargetConflict('dm-1', target),
      { initialProps: { target: valid } }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    rerender({ target: { fullyQualifiedName: 'ds.fact', isValid: true } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await act(async () => {
      resolveFirst(hit);
    });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ conflict: false, dataMart: null });
  });
});
