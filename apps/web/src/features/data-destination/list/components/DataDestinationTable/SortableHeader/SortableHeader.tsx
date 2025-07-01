import { type Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Button } from '@owox/ui/components/button';

interface SortableHeaderProps<T> {
  column: Column<T>;
  children: React.ReactNode;
}

export function SortableHeader<T>({ column, children }: SortableHeaderProps<T>) {
  return (
    <Button
      variant='ghost'
      onClick={() => {
        column.toggleSorting(column.getIsSorted() === 'asc');
      }}
      className='p-0 font-medium group-hover/header:bg-transparent hover:bg-transparent'
    >
      {children}
      {column.getIsSorted() === 'asc' ? (
        <ArrowUp className='ml-2 h-4 w-4' />
      ) : column.getIsSorted() === 'desc' ? (
        <ArrowDown className='ml-2 h-4 w-4' />
      ) : (
        <ArrowUpDown className='ml-2 h-4 w-4 opacity-0 group-hover/header:opacity-100' />
      )}
    </Button>
  );
}
