// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClipboard } from './useClipboard';

describe('useClipboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const copy = async (result: { current: ReturnType<typeof useClipboard> }) => {
    await act(async () => {
      await result.current.copyToClipboard('text', 'a');
    });
  };

  it('keeps the copied state for 2 s after the latest copy', async () => {
    const { result } = renderHook(() => useClipboard());

    await copy(result);
    act(() => vi.advanceTimersByTime(1500));
    await copy(result);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.copiedSection).toBe('a');

    act(() => vi.advanceTimersByTime(1100));
    expect(result.current.copiedSection).toBeNull();
  });

  it('drops the copied state of an earlier copy when a copy fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useClipboard());
    await copy(result);
    expect(result.current.copiedSection).toBe('a');

    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'));
    let ok = true;
    await act(async () => {
      ok = await result.current.copyToClipboard('text', 'a');
    });

    expect(ok).toBe(false);
    expect(result.current.copiedSection).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer on unmount', async () => {
    const { result, unmount } = renderHook(() => useClipboard());

    await copy(result);
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('sets no timer when it unmounts while the copy is pending', async () => {
    let resolve: () => void = () => undefined;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => new Promise<void>(r => (resolve = r))) },
      configurable: true,
    });
    const { result, unmount } = renderHook(() => useClipboard());

    let pending: Promise<boolean> = Promise.resolve(false);
    act(() => {
      pending = result.current.copyToClipboard('text', 'a');
    });
    unmount();
    resolve();

    await expect(pending).resolves.toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
