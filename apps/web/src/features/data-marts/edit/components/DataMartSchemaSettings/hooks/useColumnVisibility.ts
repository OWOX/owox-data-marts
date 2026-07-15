import type { ColumnDef, ColumnMeta } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { storageService } from '../../../../../../services/localstorage.service';

// Define proper type for column meta with hidden and title properties
interface ExtendedColumnMeta<TData> extends ColumnMeta<TData, unknown> {
  hidden?: boolean;
  title?: string;
}

/**
 * Loads the initial visibility for a storage key, layering any saved value over the
 * default-hidden set so unsaved columns fall back to their default state.
 */
function loadColumnVisibility(
  storageKey: string | undefined,
  defaultHiddenColumns: Record<string, boolean>
): Record<string, boolean> {
  const saved = storageKey
    ? (storageService.get(storageKey, 'json') as Record<string, boolean> | null)
    : null;
  return saved ? { ...defaultHiddenColumns, ...saved } : defaultHiddenColumns;
}

/**
 * Custom hook for managing column visibility functionality
 * @param columns - Table columns configuration
 * @param storageKey - Optional localStorage key; when provided, visibility is persisted per browser
 * @returns Object containing column visibility state and setter
 */
export function useColumnVisibility<TData>(columns: ColumnDef<TData>[], storageKey?: string) {
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

  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() =>
    loadColumnVisibility(storageKey, defaultHiddenColumns)
  );

  // When storageKey changes for an already-mounted table (e.g. navigating between
  // data marts without a remount), re-read the new key's saved value during render.
  // Doing it here rather than in an effect keeps the persist effect below from first
  // writing the previous key's visibility to the new key.
  const [prevStorageKey, setPrevStorageKey] = useState(storageKey);
  if (storageKey !== prevStorageKey) {
    setPrevStorageKey(storageKey);
    setColumnVisibility(loadColumnVisibility(storageKey, defaultHiddenColumns));
  }

  // `columns` is rebuilt on every render (new array/object identities), so
  // `defaultHiddenColumns` never stays referentially equal even when its content
  // doesn't change. Key off the actual set of hidden column ids instead, so this
  // effect only re-applies defaults when that set genuinely changes - otherwise it
  // would keep clobbering the user's manual show/hide toggles on every re-render.
  const defaultHiddenColumnsKey = Object.keys(defaultHiddenColumns).sort().join(',');

  useEffect(() => {
    // Merge rather than overwrite, so a real change in the default-hidden set (e.g. a
    // new column) doesn't discard visibility choices already made for other columns.
    setColumnVisibility(prev => ({ ...defaultHiddenColumns, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultHiddenColumnsKey]);

  // Persist to localStorage so the choice survives tab switches/unmounts and reloads.
  useEffect(() => {
    if (!storageKey) return;
    storageService.set(storageKey, columnVisibility);
  }, [columnVisibility, storageKey]);

  return {
    columnVisibility,
    setColumnVisibility,
    defaultHiddenColumns,
  };
}
