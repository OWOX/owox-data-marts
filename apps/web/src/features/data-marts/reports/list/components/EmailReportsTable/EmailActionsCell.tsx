import { useState, useCallback, useEffect } from 'react';
import { MoreHorizontal, Pencil, Trash2, Play } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { TooltipProvider } from '@owox/ui/components/tooltip';
import { ConfirmationDialog } from '../../../../../../shared/components/ConfirmationDialog';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { isGeneratedSqlSupported, useReport, ReportStatusEnum } from '../../../shared';
import { GeneratedSqlViewer } from '../../../../edit/components/ReportColumnPicker/GeneratedSqlViewer';

interface EmailActionsCellProps {
  row: { original: DataMartReport };
  onDeleteSuccess?: () => void;
  onEditReport?: (report: DataMartReport) => void;
  onRunSuccess?: () => void | Promise<void>;
}

export function EmailActionsCell({
  row,
  onDeleteSuccess,
  onEditReport,
  onRunSuccess,
}: EmailActionsCellProps) {
  const canRun = row.original.canRun;
  const canEditConfig = row.original.canEditConfig;
  const [isRunning, setIsRunning] = useState(
    row.original.lastRunStatus === ReportStatusEnum.RUNNING
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { deleteReport, fetchReportsByDataMartId, runReport } = useReport();

  useEffect(() => {
    setIsRunning(row.original.lastRunStatus === ReportStatusEnum.RUNNING);
  }, [row.original.lastRunStatus]);

  const actionsMenuId = `actions-menu-${row.original.id}`;

  const handleDelete = useCallback(async () => {
    if (!canEditConfig) return;

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
    canEditConfig,
    onDeleteSuccess,
    row.original.id,
    row.original.dataMart.id,
  ]);

  const handleEdit = useCallback(() => {
    if (!canEditConfig) return;

    onEditReport?.(row.original);
    setMenuOpen(false);
  }, [canEditConfig, onEditReport, row.original]);

  const handleDeleteClick = useCallback(() => {
    if (!canEditConfig) return;

    setIsDeleteDialogOpen(true);
    setMenuOpen(false);
  }, [canEditConfig]);

  const handleRun = useCallback(async () => {
    if (!canRun) return;

    try {
      setIsRunning(true);
      await runReport(row.original.id);
      await onRunSuccess?.();
    } catch (error) {
      setIsRunning(false);
      console.error('Failed to run report:', error);
    }
  }, [canRun, onRunSuccess, runReport, row.original.id]);

  return (
    <TooltipProvider>
      <div
        className='flex justify-end gap-1'
        onClick={e => {
          e.stopPropagation();
        }}
      >
        {/* View SQL */}
        {isGeneratedSqlSupported(
          row.original.dataMart.definitionType,
          row.original.dataMart.storage.type
        ) && (
          <GeneratedSqlViewer
            reportId={row.original.id}
            dataMartId={row.original.dataMart.id}
            reportTitle={row.original.title}
          />
        )}

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
              disabled={isRunning || !canRun}
              onClick={e => {
                e.stopPropagation();
                void handleRun();
              }}
              role='menuitem'
            >
              <Play className='text-foreground h-4 w-4' aria-hidden='true' />
              {isRunning ? 'Running report...' : 'Run report'}
            </DropdownMenuItem>

            <DropdownMenuItem
              disabled={!canEditConfig}
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
              disabled={!canEditConfig}
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
          description={
            <p className='break-words'>
              Are you sure you want to delete "
              <span className='font-semibold [overflow-wrap:anywhere]'>{row.original.title}</span>"?
              This action cannot be undone.
            </p>
          }
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
