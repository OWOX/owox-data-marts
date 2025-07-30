import { useState, useCallback } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';
import { useReport } from '../../../shared';

interface LookerStudioActionsCellProps {
  row: { original: DataMartReport };
  onDeleteSuccess?: () => void;
  onEditReport?: (reportId: string) => void;
}

export function LookerStudioActionsCell({
  row,
  onDeleteSuccess,
  onEditReport,
}: LookerStudioActionsCellProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { deleteReport, fetchReportsByDataMartId } = useReport();

  // Generate unique ID for the actions menu
  const actionsMenuId = `actions-menu-${row.original.id}`;

  // Memoize delete handler to avoid unnecessary re-renders
  const handleDelete = useCallback(async () => {
    try {
      setIsDeleting(true);
      await deleteReport(row.original.id);
      await fetchReportsByDataMartId(row.original.dataMart.id);
      onDeleteSuccess?.();
    } catch (error) {
      console.error('Failed to delete Looker Studio report:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [
    deleteReport,
    fetchReportsByDataMartId,
    onDeleteSuccess,
    row.original.id,
    row.original.dataMart.id,
  ]);

  const handleEdit = useCallback(() => {
    onEditReport?.(row.original.id);
    setMenuOpen(false);
  }, [onEditReport, row.original.id]);

  return (
    <div
      className='text-right'
      onClick={e => {
        e.stopPropagation();
      }}
    >
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className={`dm-card-table-body-row-actionbtn opacity-0 transition-opacity ${menuOpen ? 'opacity-100' : 'group-hover:opacity-100'}`}
            aria-label={`Actions for report: ${row.original.title}`}
            aria-haspopup='true'
            aria-expanded={menuOpen}
            aria-controls={actionsMenuId}
          >
            <span className='sr-only'>Open menu</span>
            <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' aria-hidden='true' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent id={actionsMenuId} align='end' role='menu'>
          <DropdownMenuItem
            onClick={e => {
              e.stopPropagation();
              handleEdit();
            }}
            role='menuitem'
          >
            Edit report
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className='text-red-600'
            onClick={e => {
              e.stopPropagation();
              void handleDelete();
            }}
            disabled={isDeleting}
            role='menuitem'
            aria-label={isDeleting ? 'Deleting report...' : `Delete report: ${row.original.title}`}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
