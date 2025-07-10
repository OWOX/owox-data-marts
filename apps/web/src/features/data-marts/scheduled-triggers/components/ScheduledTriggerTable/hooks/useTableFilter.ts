import { useCallback, useState } from 'react';
import type { Table } from '@tanstack/react-table';

/**
 * Custom hook for managing table filtering functionality
 * @param table - React Table instance
 * @returns Object containing filter value and change handler
 */
export function useTableFilter<TData>(table: Table<TData>) {
  const [filterValue, setFilterValue] = useState('');

  /**
   * Handles filter input change
   * @param event - Input change event
   */
  const handleFilterChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setFilterValue(value);

      // Apply global filter to the table
      table.setGlobalFilter(value);
    },
    [table]
  );

  return {
    value: filterValue,
    onChange: handleFilterChange,
  };
}
