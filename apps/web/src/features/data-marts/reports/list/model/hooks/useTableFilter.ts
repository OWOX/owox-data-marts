import { useCallback } from 'react';
import type { Table } from '@tanstack/react-table';

/**
 * Custom hook for managing table filtering functionality
 * @param table - React Table instance
 * @returns Object containing filter value and change handler
 */
export function useTableFilter<TData>(table: Table<TData>) {
  /**
   * Handles filter input change
   * @param event - Input change event
   */
  const handleFilterChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const col = table.getColumn('title');
      if (col) {
        col.setFilterValue(event.target.value);
      }
    },
    [table]
  );

  /**
   * Gets current filter value
   * @returns Current filter value as string
   */
  const getFilterValue = useCallback((): string => {
    const col = table.getColumn('title');
    if (!col) return '';
    const val = col.getFilterValue();
    return typeof val === 'string' ? val : '';
  }, [table]);

  return {
    value: getFilterValue(),
    onChange: handleFilterChange,
  };
}
