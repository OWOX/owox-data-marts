import { Button } from '@owox/ui/components/button';
import type { Table } from '@tanstack/react-table';
import type { BaseSchemaField } from '../../../../shared/types/data-mart-schema.types.ts';

interface TablePaginationProps<T extends BaseSchemaField> {
  table: Table<T>;
}

/**
 * Table pagination component with Previous/Next buttons
 */
export function TablePagination<T extends BaseSchemaField>({ table }: TablePaginationProps<T>) {
  return (
    <div
      className='flex items-center justify-between py-4'
      role='navigation'
      aria-label='Table pagination'
    >
      <div className='text-muted-foreground text-sm'>
        Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
      </div>
      <div className='flex items-center space-x-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            table.previousPage();
          }}
          disabled={!table.getCanPreviousPage()}
          aria-label='Go to previous page'
        >
          Previous
        </Button>

        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            table.nextPage();
          }}
          disabled={!table.getCanNextPage()}
          aria-label='Go to next page'
        >
          Next
        </Button>
      </div>
    </div>
  );
}
