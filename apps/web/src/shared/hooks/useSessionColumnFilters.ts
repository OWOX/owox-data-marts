import { useCallback, useEffect, useState } from 'react';
import type { ColumnFilter, ColumnFiltersState } from '@tanstack/react-table';

function isColumnFilter(value: unknown): value is ColumnFilter {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    'value' in value
  );
}

function readColumnFilters(storageKey: string | undefined): ColumnFiltersState {
  if (!storageKey) return [];
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isColumnFilter) : [];
  } catch {
    return [];
  }
}

function writeColumnFilters(storageKey: string, filters: ColumnFiltersState) {
  try {
    if (filters.length === 0) {
      sessionStorage.removeItem(storageKey);
    } else {
      sessionStorage.setItem(storageKey, JSON.stringify(filters));
    }
  } catch {
    // Storage can be unavailable (private mode, quota); the filters then live in memory only.
  }
}

/**
 * Column filters (such as the toolbar search) that survive leaving the page and coming back
 * within the same browser tab. Without a key they behave like plain component state.
 */
export function useSessionColumnFilters(
  storageKey?: string
): [ColumnFiltersState, React.Dispatch<React.SetStateAction<ColumnFiltersState>>] {
  const [state, setState] = useState(() => ({
    storageKey,
    filters: readColumnFilters(storageKey),
  }));

  // A new key (for example, another project) starts from what that key has stored.
  let current = state;
  if (state.storageKey !== storageKey) {
    current = { storageKey, filters: readColumnFilters(storageKey) };
    setState(current);
  }

  useEffect(() => {
    if (current.storageKey) {
      writeColumnFilters(current.storageKey, current.filters);
    }
  }, [current.storageKey, current.filters]);

  const setFilters = useCallback<React.Dispatch<React.SetStateAction<ColumnFiltersState>>>(
    updater => {
      setState(prev => ({
        storageKey: prev.storageKey,
        filters: typeof updater === 'function' ? updater(prev.filters) : updater,
      }));
    },
    []
  );

  return [current.filters, setFilters];
}
