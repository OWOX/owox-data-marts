// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { beforeEach, describe, expect, it } from 'vitest';
import { useColumnVisibility } from './useColumnVisibility';

interface TestRow {
  name: string;
  description?: string;
  status?: string;
}

const columns = [
  { accessorKey: 'name', enableHiding: false },
  { accessorKey: 'description', meta: { hidden: true } },
  { accessorKey: 'status' },
] as ColumnDef<TestRow>[];

describe('useColumnVisibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rejects an array stored as column visibility and restores defaults', async () => {
    const storageKey = 'schema-column-visibility';
    localStorage.setItem(storageKey, JSON.stringify(['name']));

    const { result } = renderHook(() => useColumnVisibility(columns, storageKey));

    expect(result.current.columnVisibility).toEqual({ description: false });
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(storageKey) ?? 'null')).toEqual({
        description: false,
      });
    });
  });

  it('keeps only boolean visibility values for current columns', async () => {
    const storageKey = 'schema-column-visibility';
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        description: true,
        status: false,
        removedColumn: false,
      })
    );

    const { result } = renderHook(() => useColumnVisibility(columns, storageKey));

    expect(result.current.columnVisibility).toEqual({
      description: true,
      status: false,
    });
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(storageKey) ?? 'null')).toEqual({
        description: true,
        status: false,
      });
    });
  });

  it('discards saved visibility for columns that cannot be hidden', async () => {
    const storageKey = 'schema-column-visibility';
    localStorage.setItem(storageKey, JSON.stringify({ name: false }));

    const { result } = renderHook(() => useColumnVisibility(columns, storageKey));

    expect(result.current.columnVisibility).toEqual({ description: false });
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(storageKey) ?? 'null')).toEqual({
        description: false,
      });
    });
  });
});
