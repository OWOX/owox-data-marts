import { type Table } from '@tanstack/react-table';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { Search, X } from 'lucide-react';
import { useRef } from 'react';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const column = table.getColumn(columnId);

  // If column does not exist or cannot be filtered, render nothing
  if (!column?.getCanFilter()) {
    return null;
  }

  const value = (column.getFilterValue() as string | undefined) ?? '';

  return (
    <div className='relative max-w-md min-w-0 flex-1'>
      <Search className='text-muted-foreground absolute top-2.5 left-2 h-4 w-4' />
      <Input
        ref={inputRef}
        placeholder={placeholder}
        value={value}
        onChange={event => {
          column.setFilterValue(event.target.value);
        }}
        className='border-muted dark:border-muted/50 rounded-md border bg-white pr-8 pl-8 text-sm dark:bg-white/4 dark:hover:bg-white/8'
      />
      {value && (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='text-muted-foreground hover:text-foreground absolute top-1/2 right-1 h-6 w-6 -translate-y-1/2 p-0'
          onClick={() => {
            column.setFilterValue(undefined);
            inputRef.current?.focus();
          }}
          aria-label='Clear search'
        >
          <X className='h-4 w-4' />
        </Button>
      )}
    </div>
  );
}
