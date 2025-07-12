import { useCallback, useState } from 'react';
import type { Table, Row } from '@tanstack/react-table';
import type { BaseSchemaField } from '../../../../../shared/types/data-mart-schema.types';

/**
 * Custom filter function that only searches in name, alias, and description columns
 */
export function schemaFieldFilter<T extends BaseSchemaField>(
  row: Row<T>,
  _columnId: string,
  searchValue: string
): boolean {
  const rowData = row.original;

  // If no filter value, return all rows
  if (!searchValue) return true;

  // const searchValue = String(value).toLowerCase();

  // Only search in name, alias, and description columns
  const nameMatch = rowData.name ? rowData.name.toLowerCase().includes(searchValue) : false;
  const aliasMatch = rowData.alias ? rowData.alias.toLowerCase().includes(searchValue) : false;
  const descriptionMatch = rowData.description
    ? rowData.description.toLowerCase().includes(searchValue)
    : false;

  return nameMatch || aliasMatch || descriptionMatch;
}

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
