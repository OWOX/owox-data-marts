import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type ColumnSizingState,
} from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    COLUMN_SIZING_SUFFIX: '-column-sizing',
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
  /** Current column sizing state */
  columnSizing: ColumnSizingState;
  /** Function to update column sizing state */
  setColumnSizing: React.Dispatch<React.SetStateAction<ColumnSizingState>>;
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
 *
 * NOTE: Configuration (columns, excludedColumns) is read via refs.
 * Effects must NOT depend on configuration to avoid render loops when multiple tables mount or columns are unstable.
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
  /**
   * Store configuration in refs so effects can read current values without reacting to changes.
   * This prevents infinite loops when columns or exclusion lists change identity.
   */
  const columnsRef = useRef(columns);
  const excludedColumnsFromSortingRef = useRef(excludedColumnsFromSorting);
  const excludedColumnsFromVisibilityRef = useRef(excludedColumnsFromVisibility);

  // Update refs on every render (doesn't trigger effects)
  columnsRef.current = columns;
  excludedColumnsFromSortingRef.current = excludedColumnsFromSorting;
  excludedColumnsFromVisibilityRef.current = excludedColumnsFromVisibility;

  /** localStorage keys for persisting table state */
  const STORAGE_KEYS = useMemo(
    () => ({
      SORTING: `${storageKeyPrefix}${TABLE_STORAGE_CONSTANTS.STORAGE_KEYS.SORTING_SUFFIX}`,
      COLUMN_VISIBILITY: `${storageKeyPrefix}${TABLE_STORAGE_CONSTANTS.STORAGE_KEYS.COLUMN_VISIBILITY_SUFFIX}`,
      PAGE_SIZE: `${storageKeyPrefix}${TABLE_STORAGE_CONSTANTS.STORAGE_KEYS.PAGE_SIZE_SUFFIX}`,
      COLUMN_SIZING: `${storageKeyPrefix}${TABLE_STORAGE_CONSTANTS.STORAGE_KEYS.COLUMN_SIZING_SUFFIX}`,
    }),
    [storageKeyPrefix]
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

    // Compute allowed sorting columns at initialization time
    const currentColumnIds = tableStorageUtils.extractColumnIds(columnsRef.current);
    const allowedSortingColumnIds = currentColumnIds.filter(
      id => !excludedColumnsFromSortingRef.current.includes(id)
    );

    // Select sorting column: prefer defaultSortingColumn if available, otherwise use first allowed column or constant fallback
    const finalSortingColumn = allowedSortingColumnIds.includes(defaultSortingColumn)
      ? defaultSortingColumn
      : (allowedSortingColumnIds[0] ?? TABLE_STORAGE_CONSTANTS.DEFAULT_SORTING_COLUMN);

    return [{ id: finalSortingColumn, desc: true }];
  }, [STORAGE_KEYS.SORTING, defaultSortingColumn]);

  /**
   * Initialize column visibility state from localStorage or use default
   * @returns Initial column visibility state for the table
   */
  const getInitialColumnVisibility = useCallback((): VisibilityState => {
    const savedRaw = storageService.get(STORAGE_KEYS.COLUMN_VISIBILITY, 'json');

    if (savedRaw && typeof savedRaw === 'object' && !Array.isArray(savedRaw)) {
      // Compute column IDs at initialization time
      const currentColumnIds = tableStorageUtils.extractColumnIds(columnsRef.current);
      const visibility: VisibilityState = {};
      for (const id of currentColumnIds) {
        if (excludedColumnsFromVisibilityRef.current.includes(id)) continue;
        visibility[id] = savedRaw[id] as boolean;
      }
      return visibility;
    }
    return defaultColumnVisibility;
  }, [STORAGE_KEYS.COLUMN_VISIBILITY, defaultColumnVisibility]);

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

  /**
   * Initialize column sizing state from localStorage or use default
   * @returns Initial column sizing state for the table
   */
  const getInitialColumnSizing = useCallback((): ColumnSizingState => {
    const savedRaw = storageService.get(STORAGE_KEYS.COLUMN_SIZING, 'json');

    if (savedRaw && typeof savedRaw === 'object' && !Array.isArray(savedRaw)) {
      return savedRaw as ColumnSizingState;
    }

    return {};
  }, [STORAGE_KEYS.COLUMN_SIZING]);

  /** State for table sorting configuration */
  const [sorting, setSorting] = useState<SortingState>(getInitialSorting);

  /** State for column visibility configuration */
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    getInitialColumnVisibility
  );

  /** State for page size configuration */
  const [pageSize, setPageSize] = useState<number>(getInitialPageSize);

  /** State for column sizing configuration */
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(getInitialColumnSizing);

  /**
   * Persist sorting changes to localStorage
   * Only reacts to sorting state changes, not configuration changes
   */
  useEffect(() => {
    if (sorting.length === 0) return;

    // Derive allowed columns at effect execution time from current config
    const currentColumnIds = tableStorageUtils.extractColumnIds(columnsRef.current);
    const currentAllowedSortingColumnIds = currentColumnIds.filter(
      id => !excludedColumnsFromSortingRef.current.includes(id)
    );

    // Only persist if sorting column is valid
    if (currentAllowedSortingColumnIds.includes(sorting[0].id)) {
      storageService.set(STORAGE_KEYS.SORTING, sorting);
    }
  }, [sorting, STORAGE_KEYS.SORTING]);

  /**
   * Persist column sizing changes to localStorage
   * Only reacts to columnSizing state changes, not configuration changes
   */
  useEffect(() => {
    storageService.set(STORAGE_KEYS.COLUMN_SIZING, columnSizing);
  }, [columnSizing, STORAGE_KEYS.COLUMN_SIZING]);

  /**
   * Persist column visibility changes to localStorage
   * Only reacts to columnVisibility state changes, not configuration changes
   */
  useEffect(() => {
    // Derive column IDs at effect execution time from current config
    const currentColumnIds = tableStorageUtils.extractColumnIds(columnsRef.current);

    const toPersist: Record<string, boolean> = {};
    for (const id of currentColumnIds) {
      if (excludedColumnsFromVisibilityRef.current.includes(id)) continue;
      const isVisible = columnVisibility[id];
      if (typeof isVisible === 'boolean') {
        toPersist[id] = isVisible;
      }
    }
    storageService.set(STORAGE_KEYS.COLUMN_VISIBILITY, toPersist);
  }, [columnVisibility, STORAGE_KEYS.COLUMN_VISIBILITY]);

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
    columnSizing,
    setColumnSizing,
  };
}
