import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';

interface ParameterRowActionsProps {
  /** Shown in the confirmation so it is clear WHICH parameter is about to go. */
  name: string;
  onDelete: () => void;
}

/**
 * Row actions for the parameters table, built to match the Data Mart output schema's
 * `SchemaFieldActionsButton`: a kebab that stays invisible until the row is hovered or the
 * menu is open, and a destructive item behind a confirmation.
 *
 * The confirmation is not ceremony. A parameter is a template token — `{{ parameters.X }}`
 * may be referenced from request URLs, headers, query params and the auth block, and none
 * of those references are rewritten or even flagged when the parameter disappears. The old
 * control was a bare trash icon that deleted on a single click, in the last column of a
 * table wide enough to scroll it out of sight.
 */
export function ParameterRowActions({ name, onDelete }: ParameterRowActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className='text-right'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            // focus-visible is not in the schema table's version, but without it the only
            // way to reach this action is a mouse hover — it never becomes visible while
            // tabbing to it.
            className='dm-card-table-body-row-actionbtn opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100'
            aria-label={`Actions for ${name}`}
          >
            <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            onClick={() => {
              setConfirmOpen(true);
            }}
          >
            <Trash2 className='h-4 w-4 text-red-600' aria-hidden='true' />
            <span className='text-red-600'>Delete parameter</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title='Delete parameter'
        description={
          name
            ? `Delete "${name}"? Any {{ parameters.${name} }} reference in this manifest will stop resolving.`
            : 'Delete this parameter?'
        }
        confirmLabel='Delete'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
      />
    </div>
  );
}
