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
import {
  isPullBasedDestinationType,
  pullBasedRunHint,
} from '../../../../../data-destination/shared/enums';

/** One sentence with a sheet name needs longer than the 2s default. */
const RECONNECT_TOAST_DURATION_MS = 6000;

interface ReportActionsCellProps {
  row: { original: DataMartReport };
  onDeleteSuccess?: () => void;
  onEditReport?: (report: DataMartReport) => void;
  onRunSuccess?: () => void | Promise<void>;
}

export function ReportActionsCell({
  row,
  onDeleteSuccess,
  onEditReport,
  onRunSuccess,
}: ReportActionsCellProps) {
  const canRun = row.original.canRun;
  const canEditConfig = row.original.canEditConfig;
  // A greyed-out button with no reason reads as a missing permission. This one is not: nobody
  // can start such a run, because the destination reads the data itself.
  const isPullBased = isPullBasedDestinationType(row.original.dataDestination.type);
  const pullRunHint = pullBasedRunHint(row.original.dataDestination.type);
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
      // runReport never throws — it reports the outcome as a boolean. Release
      // the optimistic flag on a failed start, or the row stays on a disabled
      // "Running report..." (lastRunStatus doesn't change, so the sync effect
      // keyed on it never fires).
      const started = await runReport(row.original.id);
      if (!started) {
        setIsRunning(false);
        return;
      }
      await onRunSuccess?.();
    } catch (error) {
      setIsRunning(false);
      console.error('Failed to run report:', error);
    }
  }, [canRun, onRunSuccess, runReport, row.original.id]);

  // Rebinds the report to a sheet named after it (reuse or create), then runs.
  // Renaming the sheet in Google Sheets later is safe — the report stores the gid.
  // Requires canRun on top of canEditConfig: the action's second half is a run,
  // and a mutate-only user would repair the sheet only to watch /run 403.
  const handleReconnectSheet = useCallback(async () => {
    if (!canEditConfig || !canRun || isReconnecting) return;

    setMenuOpen(false);
    setIsReconnecting(true);
    try {
      const result = await reportService.reconnectSheet(row.original.id);
      // One shared tail so the variants can't drift apart. It claims only what is
      // known before the run starts. `changed: false` means the report's sheet was
      // alive and the backend left it alone — the run below is then the whole
      // point, so don't claim a repair that didn't happen.
      const dataNote = 'Starting a run to load your data.';
      const outcome = !result.changed
        ? `The report is already connected to the sheet "${result.sheetTitle}"`
        : result.created
          ? `Created sheet "${result.sheetTitle}"`
          : `Reconnected to the existing sheet "${result.sheetTitle}"`;
      toast.success(`${outcome}. ${dataNote}`, { duration: RECONNECT_TOAST_DURATION_MS });
      // runReport never throws — it reports the outcome as a boolean (it also
      // refreshes the report, starts polling and toasts "Report run started").
      // Release the optimistic flag on a failed start, or the row stays on a
      // disabled "Running report..." until reload.
      setIsRunning(true);
      const started = await runReport(row.original.id);
      if (!started) {
        setIsRunning(false);
      }
      // Refresh so the row (and the "Open document" link built from the sheet
      // ID) reflects the new destination.
      await fetchReportsByDataMartId(row.original.dataMart.id);
    } catch (error) {
      // Reconnect itself failed before the run was attempted.
      setIsRunning(false);
      showApiErrorToast(error, 'Failed to reconnect sheet');
    } finally {
      setIsReconnecting(false);
    }
  }, [
    canEditConfig,
    canRun,
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
            <div className='flex flex-col'>
              <span>{isRunning ? 'Running report...' : 'Run report'}</span>
              {pullRunHint && <span className='text-muted-foreground text-xs'>{pullRunHint}</span>}
            </div>
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
              where data lands.

              Never for a pull destination: there is no sheet to rebind, and a
              failed Excel pull now reaches ERROR like any other failed run. */}
          {row.original.lastRunStatus === ReportStatusEnum.ERROR && !isPullBased && (
            <DropdownMenuItem
              disabled={!canEditConfig || !canRun || isReconnecting}
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
