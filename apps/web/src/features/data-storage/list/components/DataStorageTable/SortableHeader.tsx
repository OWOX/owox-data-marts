import { type Column } from '@tanstack/react-table';
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@owox/ui/components/button';

interface SortableHeaderProps<TData> {
  column: Column<TData>;
  children: React.ReactNode;
}

export function SortableHeader<TData>({ column, children }: SortableHeaderProps<TData>) {
  return (
    <Button
      variant='ghost'
      onClick={() => {
        column.toggleSorting(column.getIsSorted() === 'asc');
      }}
      className='px-4 hover:bg-gray-200'
    >
      {children}
      <ArrowUpDown
        data-testid='lucide-arrow-up-down'
        className={`ml-2 h-4 w-4 transition-opacity ${
          column.getIsSorted() ? 'opacity-100' : 'opacity-0 group-hover/header:opacity-70'
        }`}
      />
    </Button>
  );
}
