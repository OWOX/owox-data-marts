import { useState, useCallback, useEffect } from 'react';
import { MoreHorizontal, Pencil, Play, Trash2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { ConfirmationDialog } from '../../../../../../shared/components/ConfirmationDialog';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { ReportStatusEnum } from '../../../shared/enums';
import { useReport } from '../../../shared';

interface EmailActionsCellProps {
  row: { original: DataMartReport };
  onDeleteSuccess?: () => void;
  onEditReport?: (report: DataMartReport) => void;
}

export function EmailActionsCell({ row, onDeleteSuccess, onEditReport }: EmailActionsCellProps) {
  const [isRunning, setIsRunning] = useState(
    row.original.lastRunStatus === ReportStatusEnum.RUNNING
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { deleteReport, fetchReportsByDataMartId, runReport } = useReport();

  const actionsMenuId = `actions-menu-${row.original.id}`;

  // Sync isRunning with backend status
  useEffect(() => {
    setIsRunning(row.original.lastRunStatus === ReportStatusEnum.RUNNING);
  }, [row.original.lastRunStatus]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteReport(row.original.id);
      await fetchReportsByDataMartId(row.original.dataMart.id);
      onDeleteSuccess?.();
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error('Failed to delete report:', error);
    }
  }, [
    deleteReport,
    fetchReportsByDataMartId,
    onDeleteSuccess,
    row.original.id,
    row.original.dataMart.id,
  ]);

  const handleEdit = useCallback(() => {
    onEditReport?.(row.original);
    setMenuOpen(false);
  }, [onEditReport, row.original]);

  const handleRun = useCallback(async () => {
    try {
      setIsRunning(true);
      await runReport(row.original.id);
    } catch (error) {
      setIsRunning(false);
      console.error('Failed to run report:', error);
    }
  }, [runReport, row.original.id]);

  const handleDeleteClick = useCallback(() => {
    setIsDeleteDialogOpen(true);
    setMenuOpen(false);
  }, []);

  return (
    <TooltipProvider>
      <div
        className='flex justify-end gap-1'
        onClick={e => {
          e.stopPropagation();
        }}
      >
        {/* Run report */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={e => {
                e.stopPropagation();
                void handleRun();
              }}
              variant='ghost'
              className='dm-card-table-body-row-actionbtn opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-0 disabled:group-hover:opacity-50'
              disabled={isRunning}
              aria-label={isRunning ? 'Running report...' : `Run report: ${row.original.title}`}
            >
              <Play className='dm-card-table-body-row-actionbtn-icon' aria-hidden='true' />
            </Button>
          </TooltipTrigger>
          <TooltipContent side='bottom' role='tooltip'>
            Run report
          </TooltipContent>
        </Tooltip>

        {/* More actions */}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              className={`dm-card-table-body-row-actionbtn opacity-0 transition-opacity ${
                menuOpen ? 'opacity-100' : 'group-hover:opacity-100'
              }`}
              aria-label={`Actions for report: ${row.original.title}`}
              aria-haspopup='true'
              aria-expanded={menuOpen}
              aria-controls={actionsMenuId}
            >
              <MoreHorizontal
                className='dm-card-table-body-row-actionbtn-icon'
                aria-hidden='true'
              />
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
              <Pencil className='text-foreground h-4 w-4' aria-hidden='true' />
              Edit report
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={e => {
                e.stopPropagation();
                handleDeleteClick();
              }}
              role='menuitem'
              aria-label={`Delete report: ${row.original.title}`}
            >
              <Trash2 className='h-4 w-4 text-red-600' aria-hidden='true' />
              <span className='text-red-600'>Delete report</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ConfirmationDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          title='Delete Report'
          description={`Are you sure you want to delete "${row.original.title}"? This action cannot be undone.`}
          confirmLabel='Delete'
          cancelLabel='Cancel'
          onConfirm={() => {
            void handleDelete();
          }}
          variant='destructive'
        />
      </div>
    </TooltipProvider>
  );
}
