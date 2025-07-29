import { useState, useCallback } from 'react';
import { MoreHorizontal, SquareArrowOutUpRight, Play } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { getGoogleSheetTabUrl } from '../../../shared';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';
import { isGoogleSheetsDestinationConfig } from '../../../shared/model/types/data-mart-report.ts';
import { useReport } from '../../../shared';

interface GoogleSheetsActionsCellProps {
  row: { original: DataMartReport };
  onDeleteSuccess?: () => void;
  onEditReport?: (reportId: string) => void;
}

export function GoogleSheetsActionsCell({
  row,
  onDeleteSuccess,
  onEditReport,
}: GoogleSheetsActionsCellProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { deleteReport, fetchReportsByDataMartId, runReport } = useReport();

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
      console.error('Failed to delete Google Sheet:', error);
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
            onClick={e => {
              e.stopPropagation();
              void handleRun();
            }}
            disabled={isRunning}
            role='menuitem'
            aria-label={isRunning ? 'Running report...' : `Run report: ${row.original.title}`}
            className='flex items-center gap-1'
          >
            {isRunning ? 'Running...' : 'Run report'}
            <Play className='h-3 w-3' aria-hidden='true' />
          </DropdownMenuItem>
          {isGoogleSheetsDestinationConfig(row.original.destinationConfig) && (
            <DropdownMenuItem asChild>
              <a
                href={getGoogleSheetTabUrl(
                  row.original.destinationConfig.spreadsheetId,
                  row.original.destinationConfig.sheetId
                )}
                target='_blank'
                rel='noopener noreferrer'
                className='flex items-center gap-1'
                role='menuitem'
                onClick={e => {
                  e.stopPropagation();
                }}
              >
                Open document
                <SquareArrowOutUpRight className='h-3 w-3' aria-hidden='true' />
              </a>
            </DropdownMenuItem>
          )}
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
