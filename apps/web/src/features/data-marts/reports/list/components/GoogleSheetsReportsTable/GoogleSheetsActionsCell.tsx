import { useState, useCallback } from 'react';
import { MoreHorizontal, Pencil, Play, FileText, Trash2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { ConfirmationDialog } from '../../../../../../shared/components/ConfirmationDialog';
import { getGoogleSheetTabUrl } from '../../../shared';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { isGoogleSheetsDestinationConfig } from '../../../shared/model/types/data-mart-report';
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
  const [isRunning, setIsRunning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { deleteReport, fetchReportsByDataMartId, runReport } = useReport();

  // Generate unique ID for the actions menu
  const actionsMenuId = `actions-menu-${row.original.id}`;

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
      console.error('Failed to run report:', error);
    } finally {
      setIsRunning(false);
    }
  }, [runReport, row.original.id]);

  const handleDeleteClick = useCallback(() => {
    setIsDeleteDialogOpen(true);
    setMenuOpen(false);
  }, []);

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
            <Pencil className='text-foreground h-4 w-4' aria-hidden='true' />
            Edit report
          </DropdownMenuItem>
          {isGoogleSheetsDestinationConfig(row.original.destinationConfig) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={e => {
                  e.stopPropagation();
                  void handleRun();
                }}
                disabled={isRunning}
                role='menuitem'
                aria-label={isRunning ? 'Running report...' : `Run report: ${row.original.title}`}
              >
                <Play className='text-foreground h-4 w-4' aria-hidden='true' />
                {isRunning ? 'Running...' : 'Run report'}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={getGoogleSheetTabUrl(
                    row.original.destinationConfig.spreadsheetId,
                    row.original.destinationConfig.sheetId
                  )}
                  target='_blank'
                  rel='noopener noreferrer'
                  role='menuitem'
                  onClick={e => {
                    e.stopPropagation();
                  }}
                >
                  <FileText className='text-foreground h-4 w-4' aria-hidden='true' />
                  Open document
                </a>
              </DropdownMenuItem>
            </>
          )}
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
  );
}
