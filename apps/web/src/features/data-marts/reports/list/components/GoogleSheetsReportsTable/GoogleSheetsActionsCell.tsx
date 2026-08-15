import { useState, useCallback, useEffect } from 'react';
import { MoreHorizontal, Pencil, Trash2, Play, Link2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import toast from 'react-hot-toast';
import { ConfirmationDialog } from '../../../../../../shared/components/ConfirmationDialog';
import { showApiErrorToast } from '../../../../../../shared/utils/showApiErrorToast';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { useReport, ReportStatusEnum, reportService } from '../../../shared';

/** One sentence with a sheet name needs longer than the 2s default. */
const RECONNECT_TOAST_DURATION_MS = 6000;

interface GoogleSheetsActionsCellProps {
  row: { original: DataMartReport };
  onDeleteSuccess?: () => void;
  onEditReport?: (report: DataMartReport) => void;
  onRunSuccess?: () => void | Promise<void>;
}

export function GoogleSheetsActionsCell({
  row,
  onDeleteSuccess,
  onEditReport,
  onRunSuccess,
}: GoogleSheetsActionsCellProps) {
  const canRun = row.original.canRun;
  const canEditConfig = row.original.canEditConfig;
  const [isRunning, setIsRunning] = useState(
    row.original.lastRunStatus === ReportStatusEnum.RUNNING
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const { deleteReport, fetchReportsByDataMartId, runReport } = useReport();

  // Generate unique ID for the actions menu
  const actionsMenuId = `actions-menu-${row.original.id}`;

  // Sync isRunning state with backend status
  useEffect(() => {
    setIsRunning(row.original.lastRunStatus === ReportStatusEnum.RUNNING);
  }, [row.original.lastRunStatus]);

  // Memoize delete handler to avoid unnecessary re-renders
  const handleDelete = useCallback(async () => {
    if (!canEditConfig) return;

    try {
      await deleteReport(row.original.id);
      await fetchReportsByDataMartId(row.original.dataMart.id);
      onDeleteSuccess?.();
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error('Failed to delete Google Sheet:', error);
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

  // Rebinds the report to a sheet named after it (reuse or create), then runs.
  // Renaming the sheet in Google Sheets later is safe — the report stores the gid.
  const handleReconnectSheet = useCallback(async () => {
    if (!canEditConfig || isReconnecting) return;

    setMenuOpen(false);
    setIsReconnecting(true);
    try {
      const result = await reportService.reconnectSheet(row.original.id, {});
      // One shared tail so the variants can't drift apart. `changed: false` means
      // the report's sheet was alive and the backend left it alone — the run below
      // is then the whole point, so don't claim a repair that didn't happen.
      const dataNote = 'Your data is loading into it now.';
      const outcome = !result.changed
        ? `The report is already connected to the sheet "${result.sheetTitle}"`
        : result.created
          ? `Created sheet "${result.sheetTitle}"`
          : `Reconnected to the existing sheet "${result.sheetTitle}"`;
      toast.success(`${outcome}. ${dataNote}`, { duration: RECONNECT_TOAST_DURATION_MS });
      // runReport refreshes the report, starts status polling and toasts
      // "Report run started"; it catches its own failures, so a failed start
      // surfaces through the row status.
      setIsRunning(true);
      await runReport(row.original.id);
      // Refresh so the row (and the "Open document" link built from the sheet
      // ID) reflects the new destination.
      await fetchReportsByDataMartId(row.original.dataMart.id);
    } catch (error) {
      // Release the optimistic "running" flag, as handleRun does: the row-status
      // effect only re-syncs when lastRunStatus changes, so a failed refresh would
      // otherwise leave the menu stuck on a disabled "Running report...".
      setIsRunning(false);
      showApiErrorToast(error, 'Failed to reconnect sheet');
    } finally {
      setIsReconnecting(false);
    }
  }, [
    canEditConfig,
    isReconnecting,
    runReport,
    fetchReportsByDataMartId,
    row.original.id,
    row.original.dataMart.id,
  ]);

  const handleDeleteClick = useCallback(() => {
    if (!canEditConfig) return;

    setIsDeleteDialogOpen(true);
    setMenuOpen(false);
  }, [canEditConfig]);

  return (
    <div
      className='flex justify-end'
      onClick={e => {
        e.stopPropagation();
      }}
    >
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
            <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' aria-hidden='true' />
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

          {/* Only offered after a failed run — the error text names this button.
              On a healthy report the click would not no-op: it rebinds the
              destination to a sheet named after the report, silently moving
              where data lands. */}
          {row.original.lastRunStatus === ReportStatusEnum.ERROR && (
            <DropdownMenuItem
              disabled={!canEditConfig || isReconnecting}
              onClick={e => {
                e.stopPropagation();
                void handleReconnectSheet();
              }}
              role='menuitem'
              aria-label={`Reconnect sheet and run report: ${row.original.title}`}
            >
              <Link2 className='text-foreground h-4 w-4' aria-hidden='true' />
              {isReconnecting ? 'Reconnecting…' : 'Reconnect & run'}
            </DropdownMenuItem>
          )}

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
            <span className='font-semibold [overflow-wrap:anywhere]'>{row.original.title}</span>
            "? This action cannot be undone.
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
  );
}
