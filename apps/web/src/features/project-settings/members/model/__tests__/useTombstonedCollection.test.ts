import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTombstonedCollection } from '../useTombstonedCollection';

interface Row {
  id: string;
  label: string;
}

const idOf = (r: Row) => r.id;

describe('useTombstonedCollection', () => {
  it('returns stable references across rerenders — guards against refetch loops', () => {
    // Regression: an earlier version returned a fresh `{ tombstone, reconcile }`
    // object on every render. When the caller put that object in a useCallback
    // dependency list, every render re-created `loadData`, which re-fired the
    // useEffect, which set state, which caused another render → infinite
    // network polling. The hook MUST return a memoised object.
    const { result, rerender } = renderHook(() => useTombstonedCollection(idOf));
    const first = result.current;
    rerender();
    rerender();
    expect(result.current).toBe(first);
    expect(result.current.tombstone).toBe(first.tombstone);
    expect(result.current.reconcile).toBe(first.reconcile);
  });

  it('reconcile passes upstream through when no tombstones are recorded', () => {
    const { result } = renderHook(() => useTombstonedCollection(idOf));
    const upstream: Row[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    expect(result.current.reconcile(upstream)).toBe(upstream);
  });

  it('reconcile drops tombstoned ids that upstream still echoes', () => {
    const { result } = renderHook(() => useTombstonedCollection(idOf));
    act(() => {
      result.current.tombstone('a');
    });
    const upstream: Row[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    expect(result.current.reconcile(upstream)).toEqual([{ id: 'b', label: 'B' }]);
  });

  it('reconcile self-evicts tombstones once upstream stops returning the id', () => {
    const { result } = renderHook(() => useTombstonedCollection(idOf));
    act(() => {
      result.current.tombstone('a');
    });
    // First reconcile: upstream still returns 'a' — stays tombstoned.
    result.current.reconcile([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    // Upstream no longer returns 'a' — tombstone self-evicts.
    const next = result.current.reconcile([{ id: 'b', label: 'B' }]);
    expect(next).toEqual([{ id: 'b', label: 'B' }]);
    // If 'a' reappears later (legitimate re-creation), it must NOT be filtered.
    const resurrected = result.current.reconcile([
      { id: 'a', label: 'A2' },
      { id: 'b', label: 'B' },
    ]);
    expect(resurrected).toEqual([
      { id: 'a', label: 'A2' },
      { id: 'b', label: 'B' },
    ]);
  });
});
