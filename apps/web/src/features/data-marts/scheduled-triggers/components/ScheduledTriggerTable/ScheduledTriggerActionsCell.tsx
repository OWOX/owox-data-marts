import { useState } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';

interface ScheduledTriggerActionsCellProps {
  trigger: ScheduledTrigger;
  onEditTrigger: (id: string) => void;
  onDeleteTrigger: (id: string) => void;
}

export function ScheduledTriggerActionsCell({
  trigger,
  onEditTrigger,
  onDeleteTrigger,
}: ScheduledTriggerActionsCellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleDelete = () => {
    setIsDeleteDialogOpen(false);
    onDeleteTrigger(trigger.id);
  };

  return (
    <div
      className='text-right'
      onClick={e => {
        e.stopPropagation();
      }}
    >
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
          <DropdownMenuItem
            onClick={() => {
              onEditTrigger(trigger.id);
            }}
          >
            <Pencil className='h-4 w-4' aria-hidden='true' />
            Edit trigger
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setIsDeleteDialogOpen(true);
            }}
          >
            <Trash2 className='h-4 w-4 text-red-600' aria-hidden='true' />
            <span className='text-red-600'>Delete trigger</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title='Delete Scheduled Trigger'
        description='Are you sure you want to delete this scheduled trigger? This action cannot be undone.'
        confirmLabel='Delete'
        cancelLabel='Cancel'
        onConfirm={handleDelete}
        variant='destructive'
      />
    </div>
  );
}
