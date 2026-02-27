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
    <div className='relative w-full md:w-48 lg:w-80 xl:w-128'>
      <Search className='text-muted-foreground absolute top-2.5 left-2 h-4 w-4' />
      <Input
        placeholder={placeholder}
        value={column.getFilterValue() as string}
        onChange={event => {
          column.setFilterValue(event.target.value);
        }}
        className='border-muted dark:border-muted/50 rounded-md border bg-white pl-8 text-sm dark:bg-white/4 dark:hover:bg-white/8'
      />
    </div>
  );
}
