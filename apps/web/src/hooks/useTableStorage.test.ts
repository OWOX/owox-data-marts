// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageService } from '../services/localstorage.service';
import { useTableStorage } from './useTableStorage';

vi.mock('../services/localstorage.service', () => ({
  storageService: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
}));

const columns: ColumnDef<unknown>[] = [
  { accessorKey: 'title' },
  { accessorKey: 'reportsCount' },
  { accessorKey: 'relationshipsCount' },
  { accessorKey: 'status' },
];

describe('useTableStorage column visibility', () => {
  beforeEach(() => {
    vi.mocked(storageService.get).mockReset();
  });

  it('gives a column added after the visibility was saved its default visibility', () => {
    vi.mocked(storageService.get).mockImplementation((key: string) =>
      key === 'data-mart-list-column-visibility'
        ? { title: true, reportsCount: true, status: false }
        : null
    );

    const { result } = renderHook(() =>
      useTableStorage({
        columns,
        storageKeyPrefix: 'data-mart-list',
        defaultColumnVisibility: { reportsCount: false, relationshipsCount: false },
      })
    );

    expect(result.current.columnVisibility).toEqual({
      title: true,
      reportsCount: true,
      relationshipsCount: false,
      status: false,
    });
  });

  it('uses the defaults when nothing was saved', () => {
    vi.mocked(storageService.get).mockReturnValue(null);

    const { result } = renderHook(() =>
      useTableStorage({
        columns,
        storageKeyPrefix: 'data-mart-list',
        defaultColumnVisibility: { relationshipsCount: false },
      })
    );

    expect(result.current.columnVisibility).toEqual({ relationshipsCount: false });
  });
});
