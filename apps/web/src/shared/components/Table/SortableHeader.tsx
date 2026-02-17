import { type Column, type ColumnMeta } from '@tanstack/react-table';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { useCallback, type PropsWithChildren } from 'react';

interface ExtendedColumnMeta<TData> extends ColumnMeta<TData, unknown> {
  title?: string;
  showHeaderTitle?: boolean;
}

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

  const meta = (column as Partial<Column<TData>>).columnDef?.meta as
    | ExtendedColumnMeta<TData>
    | undefined;

  const metaTitle = meta?.title;
  const showHeaderTitle = meta?.showHeaderTitle ?? true;

  const ariaLabel = label ?? metaTitle ?? (typeof children === 'string' ? children : column.id);

  return (
    <Button
      variant='ghost'
      onClick={handleSort}
      className='group flex h-8 w-full min-w-[48px] cursor-pointer items-center gap-2 transition-colors duration-200 hover:bg-white hover:shadow-xs dark:hover:bg-white/4'
      aria-label={`${ariaLabel} - ${getSortDescription()}. Click to sort.`}
      aria-sort={getAriaSort()}
    >
      {showHeaderTitle && (
        <span
          className='min-w-0 flex-1 overflow-hidden text-left text-ellipsis whitespace-nowrap'
          title={typeof children === 'string' ? children : undefined}
        >
          {children}
        </span>
      )}
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
