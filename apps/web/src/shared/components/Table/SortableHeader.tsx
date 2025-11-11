import { type Column } from '@tanstack/react-table';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { useCallback, type PropsWithChildren } from 'react';

export interface SortableHeaderProps<TData> extends PropsWithChildren {
  column: Column<TData>;
  /** Optional accessible label for screen readers */
  label?: string;
}

/**
 * Shared sortable table header button for TanStack Table columns.
 * - Click toggles sorting between asc/desc
 * - Shows current sort state icon
 * - Provides accessible aria attributes
 */
export function SortableHeader<TData>({ column, children, label }: SortableHeaderProps<TData>) {
  const isSorted = column.getIsSorted();

  const handleSort = useCallback(() => {
    column.toggleSorting(column.getIsSorted() === 'asc');
  }, [column]);

  const getSortDescription = () => {
    if (isSorted === 'asc') return 'sorted ascending';
    if (isSorted === 'desc') return 'sorted descending';
    return 'not sorted';
  };

  const getAriaSort = () => {
    if (isSorted === 'asc') return 'ascending' as const;
    if (isSorted === 'desc') return 'descending' as const;
    return 'none' as const;
  };

  const ariaLabel = label ?? (typeof children === 'string' ? (children as string) : 'Column');

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
