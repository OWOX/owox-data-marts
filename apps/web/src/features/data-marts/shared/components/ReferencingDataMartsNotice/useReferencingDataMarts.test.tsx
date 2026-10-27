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
    renderHook(() => useReferencingDataMarts(['a'], false));

    expect(getInputSourceChangeImpact).not.toHaveBeenCalled();
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
});
