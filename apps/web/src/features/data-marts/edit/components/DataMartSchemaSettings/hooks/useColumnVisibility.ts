import type { ColumnDef, ColumnMeta } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';

// Define proper type for column meta with hidden and title properties
interface ExtendedColumnMeta<TData> extends ColumnMeta<TData, unknown> {
  hidden?: boolean;
  title?: string;
}

/**
 * Custom hook for managing column visibility functionality
 * @param columns - Table columns configuration
 * @returns Object containing column visibility state and setter
 */
export function useColumnVisibility<TData>(columns: ColumnDef<TData>[]) {
  /**
   * Generates default hidden columns configuration
   */
  const defaultHiddenColumns: Record<string, boolean> = useMemo(
    () =>
      Array.isArray(columns)
        ? (Object.fromEntries(
            columns
              .filter(col => col.meta && (col.meta as ExtendedColumnMeta<TData>).hidden)
              .map(col => [
                'id' in col && col.id
                  ? col.id
                  : 'accessorKey' in col && typeof col.accessorKey === 'string'
                    ? col.accessorKey
                    : undefined,
                false,
              ])
              .filter(([key]) => key !== undefined)
          ) as Record<string, boolean>)
        : {},
    [columns]
  );

  const [columnVisibility, setColumnVisibility] =
    useState<Record<string, boolean>>(defaultHiddenColumns);

  // `columns` is rebuilt on every render (new array/object identities), so
  // `defaultHiddenColumns` never stays referentially equal even when its content
  // doesn't change. Key off the actual set of hidden column ids instead, so this
  // effect only re-applies defaults when that set genuinely changes - otherwise it
  // would keep clobbering the user's manual show/hide toggles on every re-render.
  const defaultHiddenColumnsKey = Object.keys(defaultHiddenColumns).sort().join(',');

  useEffect(() => {
    setColumnVisibility(defaultHiddenColumns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultHiddenColumnsKey]);

  return {
    columnVisibility,
    setColumnVisibility,
    defaultHiddenColumns,
  };
}
