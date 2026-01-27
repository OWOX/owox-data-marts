import { useState } from 'react';
import {
  type ColumnDef,
  type Table,
  type ColumnFiltersState,
  type RowSelectionState,
  type VisibilityState,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
} from '@tanstack/react-table';
import { useTableStorage } from '../../hooks/useTableStorage';

/**
 * Configuration options for useBaseTable hook
 */
export interface UseBaseTableConfig<TData> {
  /** Table data array */
  data: TData[];
  /** Pre-composed column definitions from feature layer */
  columns: ColumnDef<TData>[];
  /** Prefix for localStorage keys to avoid conflicts */
  storageKeyPrefix: string;
  /** Default visibility state for columns */
  defaultColumnVisibility?: VisibilityState;
  /** Default column ID for initial sorting */
  defaultSortingColumn?: string;
  /** Enable row selection functionality */
  enableRowSelection?: boolean;
}

/**
 * Return type for useBaseTable hook
 */
export interface UseBaseTableReturn<TData> {
  /** Configured TanStack Table instance */
  table: Table<TData>;
  /** Current column filters state */
  columnFilters: ColumnFiltersState;
  /** Function to update column filters */
  setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
}

/**
 * Shared hook for table state management and React Table configuration
 *
 * This hook encapsulates common table logic including:
 * - State management (sorting, filtering, pagination, visibility, sizing)
 * - Integration with localStorage via useTableStorage
 * - React Table configuration with standard models
 *
 * The hook does NOT manipulate columns - it receives pre-composed columns
 * from the feature layer and configures the table accordingly.
 *
 * @example
 * ```tsx
 * const { table, columnFilters, setColumnFilters } = useBaseTable({
 *   data: myData,
 *   columns: myColumns,
 *   storageKeyPrefix: 'my-table',
 *   enableRowSelection: true,
 * })
 * ```
 */
export function useBaseTable<TData>({
  data,
  columns,
  storageKeyPrefix,
  defaultColumnVisibility,
  defaultSortingColumn,
  enableRowSelection = false,
}: UseBaseTableConfig<TData>): UseBaseTableReturn<TData> {
  // Initialize table storage (sorting, visibility, pagination, sizing)
  const {
    sorting,
    setSorting,
    columnVisibility,
    setColumnVisibility,
    pageSize,
    setPageSize,
    columnSizing,
    setColumnSizing,
  } = useTableStorage({
    columns,
    storageKeyPrefix,
    defaultColumnVisibility,
    defaultSortingColumn,
  });

  // Local state for column filters and row selection
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pageIndex, setPageIndex] = useState(0);

  // Configure React Table with all standard models and state
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    initialState: {
      pagination: {
        pageSize,
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination: {
        pageIndex,
        pageSize,
      },
      columnSizing,
    },
    defaultColumn: {
      size: undefined,
    },
    onColumnSizingChange: setColumnSizing,
    onPaginationChange: updater => {
      if (typeof updater === 'function') {
        const currentPagination = { pageIndex, pageSize };
        const newPagination = updater(currentPagination);

        if (newPagination.pageSize !== pageSize) {
          setPageSize(newPagination.pageSize);
        }
        if (newPagination.pageIndex !== pageIndex) {
          setPageIndex(newPagination.pageIndex);
        }
      }
    },
    enableRowSelection,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  });

  return {
    table,
    columnFilters,
    setColumnFilters,
  };
}
