import { type Table } from '@tanstack/react-table';
import { Input } from '@owox/ui/components/input';
import { Search } from 'lucide-react';

export interface TableColumnSearchProps<TData> {
  /** TanStack Table instance */
  table: Table<TData>;
  /** Column ID to apply search filter */
  columnId: string;
  /** Input placeholder text */
  placeholder?: string;
}

/**
 * Shared search input for filtering a table column.
 *
 * This component provides a consistent UI and behavior
 * for column-based search across all tables.
 */
export function TableColumnSearch<TData>({
  table,
  columnId,
  placeholder = 'Search',
}: TableColumnSearchProps<TData>) {
  const column = table.getColumn(columnId);

  // If column does not exist or cannot be filtered, render nothing
  if (!column?.getCanFilter()) {
    return null;
  }

  return (
    <div className='dm-card-toolbar-search'>
      <Search className='dm-card-toolbar-search-icon' />
      <Input
        placeholder={placeholder}
        value={column.getFilterValue() as string}
        onChange={event => {
          column.setFilterValue(event.target.value);
        }}
        className='dm-card-toolbar-search-input'
      />
    </div>
  );
}
