import { type Column } from '@tanstack/react-table';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { useCallback } from 'react';

interface SortableHeaderProps<TData> {
  column: Column<TData>;
  children: React.ReactNode;
  label?: string;
}

export function SortableHeader<TData>({ column, children, label }: SortableHeaderProps<TData>) {
  const isSorted = column.getIsSorted();

  // Memoize sort handler to avoid unnecessary re-renders
  const handleSort = useCallback(() => {
    column.toggleSorting(column.getIsSorted() === 'asc');
  }, [column]);

  // Generate accessible sort description
  const getSortDescription = () => {
    if (isSorted === 'asc') return 'sorted ascending';
    if (isSorted === 'desc') return 'sorted descending';
    return 'not sorted';
  };

  // Get proper aria-sort value
  const getAriaSort = () => {
    if (isSorted === 'asc') return 'ascending';
    if (isSorted === 'desc') return 'descending';
    return 'none';
  };

  // Use the label prop for aria-label, fallback to string 'Column'
  const ariaLabel = label ?? (typeof children === 'string' ? children : 'Column');

  return (
    <Button
      variant='ghost'
      onClick={handleSort}
      className='group dm-card-table-header-row-btn'
      aria-label={`${ariaLabel} - ${getSortDescription()}. Click to sort.`}
      aria-sort={getAriaSort()}
    >
      {children}
      <span className='flex h-4 w-4 items-center justify-center' aria-hidden='true'>
        {isSorted === 'asc' && <ChevronUp className='text-foreground h-4 w-4' />}
        {isSorted === 'desc' && <ChevronDown className='text-foreground h-4 w-4' />}
        {!isSorted && (
          <span className='opacity-0 transition-opacity duration-150 group-hover:opacity-100'>
            <ChevronUp className='text-muted-foreground h-4 w-4' />
          </span>
        )}
      </span>
    </Button>
  );
}
