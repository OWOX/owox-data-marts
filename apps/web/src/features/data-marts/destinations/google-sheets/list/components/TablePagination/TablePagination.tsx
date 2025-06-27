import { Button } from '@owox/ui/components/button';
import type { Table } from '@tanstack/react-table';
import type { GoogleSheetsReport } from '../../../shared/types';

interface TablePaginationProps {
  table: Table<GoogleSheetsReport>;
  onPreviousClick: () => void;
  onNextClick: () => void;
}

/**
 * Table pagination component with Previous/Next buttons
 */
export function TablePagination({ table, onPreviousClick, onNextClick }: TablePaginationProps) {
  return (
    <div
      className='flex items-center justify-end space-x-2 py-4'
      role='navigation'
      aria-label='Table pagination'
    >
      <Button
        variant='outline'
        size='sm'
        onClick={onPreviousClick}
        disabled={!table.getCanPreviousPage()}
        aria-label='Go to previous page'
      >
        Previous
      </Button>

      <Button
        variant='outline'
        size='sm'
        onClick={onNextClick}
        disabled={!table.getCanNextPage()}
        aria-label='Go to next page'
      >
        Next
      </Button>
    </div>
  );
}
