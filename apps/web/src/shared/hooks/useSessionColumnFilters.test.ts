import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionColumnFilters } from './useSessionColumnFilters';

const KEY = 'data-mart-list-column-filters:p1';

describe('useSessionColumnFilters', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('keeps the search for the next mount in the same tab', () => {
    const first = renderHook(() => useSessionColumnFilters(KEY));
    act(() => {
      first.result.current[1]([{ id: 'title', value: 'faceb' }]);
    });
    first.unmount();

    const second = renderHook(() => useSessionColumnFilters(KEY));
    expect(second.result.current[0]).toEqual([{ id: 'title', value: 'faceb' }]);
  });

  it('forgets the stored search once it is cleared', () => {
    sessionStorage.setItem(KEY, JSON.stringify([{ id: 'title', value: 'faceb' }]));
    const { result } = renderHook(() => useSessionColumnFilters(KEY));

    act(() => {
      result.current[1]([]);
    });

    expect(result.current[0]).toEqual([]);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('reads the stored search of the new key when the key changes', () => {
    sessionStorage.setItem(KEY, JSON.stringify([{ id: 'title', value: 'faceb' }]));
    const { result, rerender } = renderHook(
      ({ storageKey }) => useSessionColumnFilters(storageKey),
      {
        initialProps: { storageKey: KEY },
      }
    );
    expect(result.current[0]).toEqual([{ id: 'title', value: 'faceb' }]);

    rerender({ storageKey: 'data-mart-list-column-filters:p2' });

    expect(result.current[0]).toEqual([]);
    expect(sessionStorage.getItem(KEY)).toBe(JSON.stringify([{ id: 'title', value: 'faceb' }]));
  });

  it('ignores a stored value that is not a list of column filters', () => {
    sessionStorage.setItem(KEY, '{"title":"faceb"}');
    expect(renderHook(() => useSessionColumnFilters(KEY)).result.current[0]).toEqual([]);

    sessionStorage.setItem(KEY, 'not json');
    expect(renderHook(() => useSessionColumnFilters(KEY)).result.current[0]).toEqual([]);

    sessionStorage.setItem(KEY, JSON.stringify([{ value: 'faceb' }, { id: 'title', value: 'x' }]));
    expect(renderHook(() => useSessionColumnFilters(KEY)).result.current[0]).toEqual([
      { id: 'title', value: 'x' },
    ]);
  });

  it('stores nothing without a key', () => {
    const { result } = renderHook(() => useSessionColumnFilters());
    act(() => {
      result.current[1]([{ id: 'title', value: 'faceb' }]);
    });

    expect(result.current[0]).toEqual([{ id: 'title', value: 'faceb' }]);
    expect(sessionStorage.length).toBe(0);
  });
});
