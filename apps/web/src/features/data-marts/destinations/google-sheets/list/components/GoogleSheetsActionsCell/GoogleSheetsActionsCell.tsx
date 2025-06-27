import { useState, useCallback } from 'react';
import { MoreHorizontal, SquareArrowOutUpRight } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { useGoogleSheetsReportsList } from '../../../shared/model/hooks/useGoogleSheetsReportsList';
import type { GoogleSheetsReport } from '../../../shared/types';
import { getGoogleSheetTabUrl } from '../../utils';

interface GoogleSheetsActionsCellProps {
  row: { original: GoogleSheetsReport };
  onDeleteSuccess?: () => void;
  onEditReport?: (reportId: string) => void;
}

export function GoogleSheetsActionsCell({
  row,
  onDeleteSuccess,
  onEditReport,
}: GoogleSheetsActionsCellProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { deleteGoogleSheet, refreshList } = useGoogleSheetsReportsList();

  // Generate unique ID for the actions menu
  const actionsMenuId = `actions-menu-${row.original.id}`;

  // Memoize delete handler to avoid unnecessary re-renders
  const handleDelete = useCallback(async () => {
    try {
      setIsDeleting(true);
      await deleteGoogleSheet(row.original.id);
      await refreshList();
      onDeleteSuccess?.();
    } catch (error) {
      console.error('Failed to delete Google Sheet:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteGoogleSheet, refreshList, onDeleteSuccess, row.original.id]);

  // Memoize edit handler
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
            className='h-8 w-8 p-0 hover:bg-gray-200/50 dark:hover:bg-white/10'
            aria-label={`Actions for report: ${row.original.title}`}
            aria-haspopup='true'
            aria-expanded={menuOpen}
            aria-controls={actionsMenuId}
          >
            <span className='sr-only'>Open menu</span>
            <MoreHorizontal className='h-4 w-4' aria-hidden='true' />
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
