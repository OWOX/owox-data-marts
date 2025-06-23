import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import type { DataMartListItem } from '../../model/types';
import { useDataMartList } from '../../model/hooks';

interface DataMartActionsCellProps {
  row: { original: DataMartListItem };
  onDeleteSuccess?: () => void;
}

export const DataMartActionsCell = ({ row, onDeleteSuccess }: DataMartActionsCellProps) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='h-8 w-8 p-0'>
            <span className='sr-only'>Open menu</span>
            <MoreHorizontal className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem>
            <Link
              to={`/data-marts/${row.original.id}/overview`}
              className='flex w-full items-center'
            >
              Open
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className='text-red-600'
            onClick={() => {
              setIsDeleteDialogOpen(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title='Delete Data Mart'
        description='Are you sure you want to delete this data mart? This action cannot be undone.'
        confirmLabel='Delete'
        cancelLabel='Cancel'
        onConfirm={() => void handleDelete()}
        variant='destructive'
      />
    </div>
  );
};
