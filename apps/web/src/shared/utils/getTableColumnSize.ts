import type { Column } from '@tanstack/react-table';

export function getTableColumnSize<TData>(column: Column<TData>) {
  return {
    width: column.getSize(),
  };
}
