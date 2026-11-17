import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAutoRefresh } from './useAutoRefresh';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useAutoRefresh', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('ticks as soon as a hidden tab is shown again', () => {
    const onTick = vi.fn();
    renderHook(() => {
      useAutoRefresh({ enabled: true, intervalMs: 30000, onTick });
    });
    expect(onTick).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    expect(onTick).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('stops listening for visibility changes after unmount', () => {
    const onTick = vi.fn();
    const { unmount } = renderHook(() => {
      useAutoRefresh({ enabled: true, intervalMs: 30000, onTick });
    });
    unmount();

    setVisibility('hidden');
    setVisibility('visible');
    expect(onTick).toHaveBeenCalledTimes(1);
  });
});
