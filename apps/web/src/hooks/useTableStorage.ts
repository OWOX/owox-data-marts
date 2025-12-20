import { type ColumnDef, type SortingState, type VisibilityState } from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { storageService } from '../services/localstorage.service';

/**
 * Constants for table storage functionality
 */
const TABLE_STORAGE_CONSTANTS = {
  DEFAULT_SORTING_COLUMN: 'createdAt',
  DEFAULT_EXCLUDED_COLUMNS: ['actions'] as string[],
  DEFAULT_PAGE_SIZE: 15,
  STORAGE_KEYS: {
    SORTING_SUFFIX: '-sorting',
    COLUMN_VISIBILITY_SUFFIX: '-column-visibility',
    PAGE_SIZE_SUFFIX: '-page-size',
  },
} as const;

/**
 * Utility functions for table storage operations
 */
const tableStorageUtils = {
  /**
   * Extract column IDs from column definitions
   *
   */
  extractColumnIds: <TData, TValue>(columns: ColumnDef<TData, TValue>[]): string[] =>
    columns
      .map(col => {
        if (col.id) return col.id;

        if ('accessorKey' in col && typeof col.accessorKey === 'string') {
          return col.accessorKey;
        }

        return undefined;
      })
      .filter((id): id is string => id !== undefined),
} as const;

/**
 * Props for the useTableStorage hook
 */
interface UseTableStorageProps<TData, TValue> {
  /** Array of column definitions from react-table */
  columns: ColumnDef<TData, TValue>[];
  /** Prefix for localStorage keys to avoid conflicts */
  storageKeyPrefix: string;
  /** Default column ID for initial sorting (defaults to 'createdAt') */
  defaultSortingColumn?: string;
  /** Default visibility state for columns */
  defaultColumnVisibility?: VisibilityState;
  /** Default page size for pagination */
  defaultPageSize?: number;
  /** Column IDs to exclude from sorting persistence */
  excludedColumnsFromSorting?: string[];
  /** Column IDs to exclude from visibility persistence */
  excludedColumnsFromVisibility?: string[];
}

/**
 * Return type for the useTableStorage hook
 */
interface UseTableStorageReturn {
  /** Current sorting state */
  sorting: SortingState;
  /** Function to update sorting state */
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
  /** Current column visibility state */
  columnVisibility: VisibilityState;
  /** Function to update column visibility state */
  setColumnVisibility: React.Dispatch<React.SetStateAction<VisibilityState>>;
  /** Current page size */
  pageSize: number;
  /** Function to update page size */
  setPageSize: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Custom hook for managing table state persistence in localStorage
 *
 * This hook manages sorting and column visibility state for react-table,
 * automatically persisting changes to localStorage and restoring them on component mount.
 *
 * @param props - Configuration object for the hook
 * @param props.columns - Array of column definitions from react-table
 * @param props.storageKeyPrefix - Prefix for localStorage keys to avoid conflicts
 * @param props.defaultSortingColumn - Default column ID for initial sorting (defaults to 'createdAt')
 * @param props.defaultColumnVisibility - Default visibility state for columns
 * @param props.excludedColumnsFromSorting - Column IDs to exclude from sorting persistence (defaults to ['actions'])
 * @param props.excludedColumnsFromVisibility - Column IDs to exclude from visibility persistence (defaults to ['actions'])
 * @returns Object containing sorting and column visibility state and their setters
 */
export function useTableStorage<TData, TValue>({
  columns,
  storageKeyPrefix,
  defaultSortingColumn = TABLE_STORAGE_CONSTANTS.DEFAULT_SORTING_COLUMN,
  defaultColumnVisibility = {},
  defaultPageSize = TABLE_STORAGE_CONSTANTS.DEFAULT_PAGE_SIZE,
  excludedColumnsFromSorting = TABLE_STORAGE_CONSTANTS.DEFAULT_EXCLUDED_COLUMNS,
  excludedColumnsFromVisibility = TABLE_STORAGE_CONSTANTS.DEFAULT_EXCLUDED_COLUMNS,
}: UseTableStorageProps<TData, TValue>): UseTableStorageReturn {
  /** localStorage keys for persisting table state */
  const STORAGE_KEYS = useMemo(
    () => ({
      SORTING: `${storageKeyPrefix}${TABLE_STORAGE_CONSTANTS.STORAGE_KEYS.SORTING_SUFFIX}`,
      COLUMN_VISIBILITY: `${storageKeyPrefix}${TABLE_STORAGE_CONSTANTS.STORAGE_KEYS.COLUMN_VISIBILITY_SUFFIX}`,
      PAGE_SIZE: `${storageKeyPrefix}${TABLE_STORAGE_CONSTANTS.STORAGE_KEYS.PAGE_SIZE_SUFFIX}`,
    }),
    [storageKeyPrefix]
  );

  /** Extract column IDs from column definitions */
  const columnIds = useMemo(() => tableStorageUtils.extractColumnIds(columns), [columns]);

  /** Column IDs that are allowed to be used for sorting */
  const allowedSortingColumnIds = useMemo(
    () => columnIds.filter(id => !excludedColumnsFromSorting.includes(id)),
    [columnIds, excludedColumnsFromSorting]
  );

  /**
   * Initialize sorting state from localStorage or use default
   * @returns Initial sorting state for the table
   */
  const getInitialSorting = useCallback((): SortingState => {
    const savedRaw = storageService.get(STORAGE_KEYS.SORTING, 'json') as SortingState | null;

    if (savedRaw && Array.isArray(savedRaw) && savedRaw.length > 0) {
      return savedRaw;
    }

    // Select sorting column: prefer defaultSortingColumn if available, otherwise use first allowed column or constant fallback
    const finalSortingColumn = allowedSortingColumnIds.includes(defaultSortingColumn)
      ? defaultSortingColumn
      : (allowedSortingColumnIds[0] ?? TABLE_STORAGE_CONSTANTS.DEFAULT_SORTING_COLUMN);

    return [{ id: finalSortingColumn, desc: true }];
  }, [STORAGE_KEYS.SORTING, allowedSortingColumnIds, defaultSortingColumn]);

  /**
   * Initialize column visibility state from localStorage or use default
   * @returns Initial column visibility state for the table
   */
  const getInitialColumnVisibility = useCallback((): VisibilityState => {
    const savedRaw = storageService.get(STORAGE_KEYS.COLUMN_VISIBILITY, 'json');

    if (savedRaw && typeof savedRaw === 'object' && !Array.isArray(savedRaw)) {
      const visibility: VisibilityState = {};
      for (const id of columnIds) {
        if (excludedColumnsFromVisibility.includes(id)) continue;
        visibility[id] = savedRaw[id] as boolean;
      }
      return visibility;
    }
    return defaultColumnVisibility;
  }, [
    STORAGE_KEYS.COLUMN_VISIBILITY,
    columnIds,
    excludedColumnsFromVisibility,
    defaultColumnVisibility,
  ]);

  /**
   * Initialize page size from localStorage or use default
   * @returns Initial page size for the table
   */
  const getInitialPageSize = useCallback((): number => {
    const savedValue = storageService.get(STORAGE_KEYS.PAGE_SIZE);
    const savedPageSize = savedValue ? Number(savedValue) : null;
    return typeof savedPageSize === 'number' && !isNaN(savedPageSize) && savedPageSize > 0
      ? savedPageSize
      : defaultPageSize;
  }, [STORAGE_KEYS.PAGE_SIZE, defaultPageSize]);

  /** State for table sorting configuration */
  const [sorting, setSorting] = useState<SortingState>(getInitialSorting);

  /** State for column visibility configuration */
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    getInitialColumnVisibility
  );

  /** State for page size configuration */
  const [pageSize, setPageSize] = useState<number>(getInitialPageSize);

  /** Persist sorting changes to localStorage */
  useEffect(() => {
    if (sorting.length > 0 && allowedSortingColumnIds.includes(sorting[0].id)) {
      storageService.set(STORAGE_KEYS.SORTING, sorting);
    }
  }, [sorting, allowedSortingColumnIds, STORAGE_KEYS.SORTING]);

  /** Persist column visibility changes to localStorage */
  useEffect(() => {
    const toPersist: Record<string, boolean> = {};
    for (const id of columnIds) {
      if (excludedColumnsFromVisibility.includes(id)) continue;
      const isVisible = columnVisibility[id];
      if (typeof isVisible === 'boolean') {
        toPersist[id] = isVisible;
      }
    }
    storageService.set(STORAGE_KEYS.COLUMN_VISIBILITY, toPersist);
  }, [columnVisibility, columnIds, excludedColumnsFromVisibility, STORAGE_KEYS.COLUMN_VISIBILITY]);

  /** Persist page size changes to localStorage */
  useEffect(() => {
    storageService.set(STORAGE_KEYS.PAGE_SIZE, pageSize);
  }, [pageSize, STORAGE_KEYS.PAGE_SIZE]);

  return {
    sorting,
    setSorting,
    columnVisibility,
    setColumnVisibility,
    pageSize,
    setPageSize,
  };
}
