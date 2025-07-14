import { Button } from '@owox/ui/components/button';
import type { Table } from '@tanstack/react-table';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';

interface TablePaginationProps {
  table: Table<DataMartReport>;
  onPreviousClick: () => void;
  onNextClick: () => void;
}

/**
 * Table pagination component with Previous/Next buttons
 */
export function TablePagination({ table, onPreviousClick, onNextClick }: TablePaginationProps) {
  return (
    <div className='dm-card-pagination' role='navigation' aria-label='Table pagination'>
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
