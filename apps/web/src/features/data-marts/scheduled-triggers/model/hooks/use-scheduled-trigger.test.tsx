import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScheduledTrigger } from './use-scheduled-trigger';

const mocks = vi.hoisted(() => ({ reset: vi.fn(), context: vi.fn() }));

vi.mock('../context', () => ({ useScheduledTriggerContext: mocks.context }));

function contextWith(getScheduledTriggers: () => Promise<void>) {
  mocks.context.mockReturnValue({
    getScheduledTriggers,
    reset: mocks.reset,
    triggers: [],
    isLoading: false,
    error: null,
  });
}

describe('useScheduledTrigger', () => {
  beforeEach(() => {
    mocks.reset.mockClear();
  });

  it('keeps the list when only the loader changes, as after a Data Mart refresh', () => {
    const first = vi.fn().mockResolvedValue(undefined);
    contextWith(first);
    const { rerender } = renderHook(({ id }) => useScheduledTrigger(id), {
      initialProps: { id: 'dm1' },
    });
    expect(first).toHaveBeenCalledTimes(1);

    const second = vi.fn().mockResolvedValue(undefined);
    contextWith(second);
    rerender({ id: 'dm1' });

    expect(second).not.toHaveBeenCalled();
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('resets and loads again for another Data Mart', () => {
    const load = vi.fn().mockResolvedValue(undefined);
    contextWith(load);
    const { rerender } = renderHook(({ id }) => useScheduledTrigger(id), {
      initialProps: { id: 'dm1' },
    });

    rerender({ id: 'dm2' });

    expect(mocks.reset).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenLastCalledWith('dm2');
  });
});
