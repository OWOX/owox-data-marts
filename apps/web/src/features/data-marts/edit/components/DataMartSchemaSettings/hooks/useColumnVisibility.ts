import type { ColumnDef, ColumnMeta } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { storageService } from '../../../../../../services/localstorage.service';

// Define proper type for column meta with hidden and title properties
interface ExtendedColumnMeta<TData> extends ColumnMeta<TData, unknown> {
  hidden?: boolean;
  title?: string;
}

function getColumnId<TData>(column: ColumnDef<TData>): string | undefined {
  if (column.id) return column.id;
  if ('accessorKey' in column && typeof column.accessorKey === 'string') {
    return column.accessorKey;
  }
  return undefined;
}

/**
 * Loads the initial visibility for a storage key, layering any saved value over the
 * default-hidden set so unsaved columns fall back to their default state.
 */
function loadColumnVisibility(
  storageKey: string | undefined,
  defaultHiddenColumns: Record<string, boolean>,
  columnIds: readonly string[]
): Record<string, boolean> {
  const savedRaw = storageKey ? storageService.get(storageKey, 'json') : null;
  if (!savedRaw || typeof savedRaw !== 'object' || Array.isArray(savedRaw)) {
    return defaultHiddenColumns;
  }

  const saved: Record<string, boolean> = {};
  for (const id of columnIds) {
    if (typeof savedRaw[id] === 'boolean') {
      saved[id] = savedRaw[id];
    }
  }
  return { ...defaultHiddenColumns, ...saved };
}

/**
 * Custom hook for managing column visibility functionality
 * @param columns - Table columns configuration
 * @param storageKey - Optional localStorage key; when provided, visibility is persisted per browser
 * @returns Object containing column visibility state and setter
 */
export function useColumnVisibility<TData>(columns: ColumnDef<TData>[], storageKey?: string) {
  const hideableColumnIds = useMemo(
    () =>
      columns
        .filter(column => column.enableHiding !== false)
        .map(getColumnId)
        .filter((id): id is string => id !== undefined),
    [columns]
  );

  /**
   * Generates default hidden columns configuration
   */
  const defaultHiddenColumns: Record<string, boolean> = useMemo(
    () =>
      Array.isArray(columns)
        ? (Object.fromEntries(
            columns
              .filter(col => col.meta && (col.meta as ExtendedColumnMeta<TData>).hidden)
              .map(col => [getColumnId(col), false])
              .filter(([key]) => key !== undefined)
          ) as Record<string, boolean>)
        : {},
    [columns]
  );

  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() =>
    loadColumnVisibility(storageKey, defaultHiddenColumns, hideableColumnIds)
  );

  // When storageKey changes for an already-mounted table (e.g. navigating between
  // data marts without a remount), re-read the new key's saved value during render.
  // Doing it here rather than in an effect keeps the persist effect below from first
  // writing the previous key's visibility to the new key.
  const [prevStorageKey, setPrevStorageKey] = useState(storageKey);
  if (storageKey !== prevStorageKey) {
    setPrevStorageKey(storageKey);
    setColumnVisibility(loadColumnVisibility(storageKey, defaultHiddenColumns, hideableColumnIds));
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
