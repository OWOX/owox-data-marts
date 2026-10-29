import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReferencingDataMarts } from './useReferencingDataMarts';

const getInputSourceChangeImpact = vi.hoisted(() => vi.fn());

vi.mock('../../services/data-mart.service', () => ({
  dataMartService: { getInputSourceChangeImpact },
}));

const impact = (referencing: { id: string; title: string }[], count = referencing.length) => ({
  outboundRelationshipsCount: 0,
  inboundRelationshipsCount: 0,
  reportsCount: 0,
  referencingDataMartsCount: count,
  referencingDataMarts: referencing,
});

describe('useReferencingDataMarts', () => {
  beforeEach(() => {
    getInputSourceChangeImpact.mockReset();
  });

  it('loads nothing until enabled', () => {
    const { result } = renderHook(() => useReferencingDataMarts(['a'], false));

    expect(getInputSourceChangeImpact).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('is loading from the first enabled render, so a confirmation can wait for the answer', () => {
    getInputSourceChangeImpact.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useReferencingDataMarts(['a'], true));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.total).toBe(0);
  });

  it('is not loading when there is nothing to check', () => {
    const { result } = renderHook(() => useReferencingDataMarts([], true));

    expect(result.current.isLoading).toBe(false);
    expect(getInputSourceChangeImpact).not.toHaveBeenCalled();
  });

  it('checks again when reopened, instead of showing the old answer', async () => {
    getInputSourceChangeImpact.mockResolvedValue(impact([{ id: 'x', title: 'Retail orders' }]));
    const { result, rerender } = renderHook(
      ({ enabled }) => useReferencingDataMarts(['a'], enabled),
      { initialProps: { enabled: true } }
    );
    await waitFor(() => {
      expect(result.current.total).toBe(1);
    });

    rerender({ enabled: false });
    rerender({ enabled: true });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getInputSourceChangeImpact).toHaveBeenCalledTimes(2);
  });

  it('merges the answers, skipping the Data Marts being checked and counting hidden ones', async () => {
    getInputSourceChangeImpact.mockImplementation(async (id: string) =>
      id === 'a'
        ? impact(
            [
              { id: 'b', title: 'B' },
              { id: 'x', title: 'Shared' },
            ],
            3
          )
        : impact([{ id: 'x', title: 'Shared' }])
    );

    const { result } = renderHook(() => useReferencingDataMarts(['a', 'b'], true));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.dataMarts).toEqual([{ id: 'x', title: 'Shared' }]);
    // One visible outside the selection, plus one 'a' could not name.
    expect(result.current.total).toBe(2);
    expect(result.current.hasError).toBe(false);
  });

  it('reports a failed check as an error, not as no references', async () => {
    getInputSourceChangeImpact.mockRejectedValue(new Error('Forbidden'));

    const { result } = renderHook(() => useReferencingDataMarts(['a'], true));

    await waitFor(() => {
      expect(result.current.hasError).toBe(true);
    });
    expect(result.current.total).toBe(0);
  });

  it('keeps what the other checks found when one of them fails', async () => {
    getInputSourceChangeImpact.mockImplementation(async (id: string) => {
      if (id === 'shared-for-reporting') throw new Error('Forbidden');
      return impact([{ id: 'x', title: 'Retail orders' }]);
    });

    const { result } = renderHook(() =>
      useReferencingDataMarts(['a', 'shared-for-reporting', 'b'], true)
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(getInputSourceChangeImpact).toHaveBeenCalledTimes(3);
    expect(result.current.dataMarts).toEqual([{ id: 'x', title: 'Retail orders' }]);
    expect(result.current.hasError).toBe(true);
  });
});
