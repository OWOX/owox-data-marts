import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useModelCanvasFilters } from './use-model-canvas-filters';

vi.mock('../../../../services/localstorage.service', () => ({
  storageService: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
}));

function createWrapper(search: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[`/ui/project-1/data-marts/models${search}`]}>
      <Routes>
        <Route path='/ui/:projectId/data-marts/models' element={children} />
      </Routes>
    </MemoryRouter>
  );
}

function useFiltersWithSearch() {
  return { filters: useModelCanvasFilters(), search: useLocation().search };
}

describe('useModelCanvasFilters', () => {
  it.each([
    ['?rel=connected', 'connected'],
    ['?rel=unconnected', 'unconnected'],
    ['', 'all'],
    ['?rel=bogus', 'all'],
  ])('parses rel from %s as %s', (search, expected) => {
    const { result } = renderHook(useFiltersWithSearch, { wrapper: createWrapper(search) });
    expect(result.current.filters.rel).toBe(expected);
  });

  it('writes rel to the URL and removes it again for "all"', () => {
    const { result } = renderHook(useFiltersWithSearch, { wrapper: createWrapper('') });

    act(() => {
      result.current.filters.setRel('unconnected');
    });
    expect(result.current.search).toBe('?rel=unconnected');
    expect(result.current.filters.rel).toBe('unconnected');

    act(() => {
      result.current.filters.setRel('all');
    });
    expect(result.current.search).toBe('');
    expect(result.current.filters.rel).toBe('all');
  });
});
