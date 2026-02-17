import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmationDialog } from '../../../../../../shared/components/ConfirmationDialog';
import { useProjectRoute } from '../../../../../../shared/hooks';
import { DataStorageType } from '../../../../../data-storage';
import { useDataMartList } from '../../../model/hooks';
import type { DataMartListItem } from '../../../model/types';

interface DataMartActionsCellProps {
  row: { original: DataMartListItem };
  onDeleteSuccess?: () => void;
}

export const DataMartActionsCell = ({ row, onDeleteSuccess }: DataMartActionsCellProps) => {
  const { scope } = useProjectRoute();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { deleteDataMart, refreshList } = useDataMartList();

  const handleDelete = async () => {
    try {
      await deleteDataMart(row.original.id);
      setIsDeleteDialogOpen(false);
      await refreshList();
      onDeleteSuccess?.();
    } catch (error) {
      console.error('Failed to delete data mart:', error);
    }
  };

  return (
    <div className='text-right'>
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className={`dm-card-table-body-row-actionbtn opacity-0 transition-opacity ${isMenuOpen ? 'opacity-100' : 'group-hover:opacity-100'}`}
            aria-label='Open menu'
          >
            <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem>
            <Link
              to={scope(`/data-marts/${row.original.id}/data-setup`)}
              className='flex gap-2 text-left'
            >
              <Pencil className='text-foreground h-4 w-4' aria-hidden='true' />
              <span>Edit</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setIsDeleteDialogOpen(true);
            }}
          >
            <Trash2 className='h-4 w-4 text-red-600' aria-hidden='true' />
            <span className='text-red-600'>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title='Delete Data Mart'
        description={
          <span className='mt-2 block space-y-2'>
            <span className='block'>
              Are you sure you want to delete <strong>this data mart</strong>? This action cannot be
              undone.
            </span>
            {row.original.storageType === DataStorageType.LEGACY_GOOGLE_BIGQUERY && (
              <span className='text-destructive block'>
                Deleting this data mart will also make it unavailable in the Google Sheets
                extension.
              </span>
            )}
          </span>
        }
        confirmLabel='Delete'
        cancelLabel='Cancel'
        onConfirm={() => void handleDelete()}
        variant='destructive'
      />
    </div>
  );
};
