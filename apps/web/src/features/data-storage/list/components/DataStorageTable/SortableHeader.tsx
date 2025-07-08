import { type Column } from '@tanstack/react-table';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
      className='group dm-card-table-header-row-btn'
    >
      {children}
      <span className='flex h-4 w-4 items-center justify-center' aria-hidden='true'>
        {column.getIsSorted() === 'asc' && (
          <ChevronUp data-testid='lucide-arrow-up-down' className='text-foreground h-4 w-4' />
        )}
        {column.getIsSorted() === 'desc' && (
          <ChevronDown data-testid='lucide-arrow-up-down' className='text-foreground h-4 w-4' />
        )}
        {!column.getIsSorted() && (
          <span className='opacity-0 transition-opacity duration-150 group-hover:opacity-100'>
            <ChevronUp
              data-testid='lucide-arrow-up-down'
              className='text-muted-foreground h-4 w-4'
            />
          </span>
        )}
      </span>
    </Button>
  );
}
