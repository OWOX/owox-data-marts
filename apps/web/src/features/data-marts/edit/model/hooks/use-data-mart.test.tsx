// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataMartContext } from '../context';
import { useDataMart } from './use-data-mart';

vi.mock('../context', () => ({
  useDataMartContext: vi.fn(),
}));

describe('useDataMart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes refreshDataMart from the provider context', () => {
    const refreshDataMart = vi.fn().mockResolvedValue(undefined);

    vi.mocked(useDataMartContext).mockReturnValue({
      getDataMart: vi.fn().mockResolvedValue(undefined),
      refreshDataMart,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useDataMartContext>);

    const { result } = renderHook(() => useDataMart());

    expect(result.current.refreshDataMart).toBe(refreshDataMart);
  });
});
