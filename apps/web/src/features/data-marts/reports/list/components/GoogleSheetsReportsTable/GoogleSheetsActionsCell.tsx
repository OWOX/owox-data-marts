import { useState, useCallback, useEffect } from 'react';
import { MoreHorizontal, Pencil, Play, FileText, Trash2 } from 'lucide-react';
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
import { getGoogleSheetTabUrl } from '../../../shared';
import type {
  DataMartReport,
  GoogleSheetsDestinationConfig,
} from '../../../shared/model/types/data-mart-report';
import { ReportStatusEnum } from '../../../shared/enums';
import { useReport } from '../../../shared';

interface GoogleSheetsActionsCellProps {
  row: { original: DataMartReport };
  onDeleteSuccess?: () => void;
  onEditReport?: (report: DataMartReport) => void;
}

export function GoogleSheetsActionsCell({
  row,
  onDeleteSuccess,
  onEditReport,
}: GoogleSheetsActionsCellProps) {
  const [isRunning, setIsRunning] = useState(
    row.original.lastRunStatus === ReportStatusEnum.RUNNING
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { deleteReport, fetchReportsByDataMartId, runReport } = useReport();

  // Generate unique ID for the actions menu
  const actionsMenuId = `actions-menu-${row.original.id}`;

  // Sync isRunning state with backend status
  useEffect(() => {
    setIsRunning(row.original.lastRunStatus === ReportStatusEnum.RUNNING);
  }, [row.original.lastRunStatus]);

  // Memoize delete handler to avoid unnecessary re-renders
  const handleDelete = useCallback(async () => {
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
          <TooltipContent id={`run-report-${row.original.id}`} side='bottom' role='tooltip'>
            Run report
          </TooltipContent>
        </Tooltip>

        {/* Open doc */}
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={getGoogleSheetTabUrl(
                (row.original.destinationConfig as GoogleSheetsDestinationConfig).spreadsheetId,
                (row.original.destinationConfig as GoogleSheetsDestinationConfig).sheetId
              )}
              className='dm-card-table-body-row-actionbtn inline-flex items-center justify-center rounded-md px-3 opacity-0 transition-opacity group-hover:opacity-100'
              target='_blank'
              rel='noopener noreferrer'
              onClick={e => {
                e.stopPropagation();
              }}
            >
              <FileText className='dm-card-table-body-row-actionbtn-icon' aria-hidden='true' />
            </a>
          </TooltipTrigger>
          <TooltipContent id={`run-report-${row.original.id}`} side='bottom' role='tooltip'>
            Open document
          </TooltipContent>
        </Tooltip>

        {/* More actions */}
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
