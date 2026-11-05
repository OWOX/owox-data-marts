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
    expect(result.current).toEqual({ conflict: hit, isPending: false });
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
    expect(invalid.result.current).toEqual({ conflict: null, isPending: false });
    expect(outside.result.current).toEqual({ conflict: null, isPending: false });
  });

  it('counts a failed lookup as answered with no conflict, and drops the previous answer', async () => {
    const spy = vi
      .spyOn(dataMartService, 'getConnectorTargetConflict')
      .mockResolvedValueOnce(hit)
      .mockRejectedValueOnce(new Error('x'));
    const { result, rerender } = renderHook(
      ({ target }) => useConnectorTargetConflict('dm-1', target),
      { initialProps: { target: valid } }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current).toEqual({ conflict: hit, isPending: false });

    rerender({ target: { fullyQualifiedName: 'ds.fact', isValid: true } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(spy).toHaveBeenLastCalledWith('dm-1', 'ds.fact');
    expect(result.current).toEqual({ conflict: null, isPending: false });
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
    expect(result.current).toEqual({
      conflict: { conflict: false, dataMart: null },
      isPending: false,
    });
  });

  it('is pending as soon as the target changes, before the debounce ends', async () => {
    vi.spyOn(dataMartService, 'getConnectorTargetConflict').mockResolvedValue(hit);
    const { result, rerender } = renderHook(
      ({ target }) => useConnectorTargetConflict('dm-1', target),
      { initialProps: { target: valid } }
    );
    expect(result.current).toEqual({ conflict: null, isPending: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current).toEqual({ conflict: hit, isPending: false });

    rerender({ target: { fullyQualifiedName: 'ds.fact', isValid: true } });

    expect(result.current).toEqual({ conflict: null, isPending: true });
  });

  it('reports a no-conflict answer as answered', async () => {
    const none = { conflict: false, dataMart: null };
    vi.spyOn(dataMartService, 'getConnectorTargetConflict').mockResolvedValue(none);
    const { result } = renderHook(() => useConnectorTargetConflict('dm-1', valid));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(result.current).toEqual({ conflict: none, isPending: false });
  });

  it('is not pending without a lookup for a null target', () => {
    const { result } = renderHook(() => useConnectorTargetConflict('dm-1', null));

    expect(result.current).toEqual({ conflict: null, isPending: false });
  });
});
