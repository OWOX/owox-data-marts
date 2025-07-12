import { type Table, type Row } from '@tanstack/react-table';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { ToggleColumnsHeader } from './ToggleColumnsHeader';

interface ActionsDropdownProps<TData> {
  table: Table<TData>;
  row?: Row<TData>;
  onDeleteRow?: (index: number) => void;
}

export function ActionsDropdown<TData>({ table, row, onDeleteRow }: ActionsDropdownProps<TData>) {
  // If no row is provided, render the ToggleColumnsHeader (for the header cell)
  if (!row) {
    return <ToggleColumnsHeader table={table} />;
  }

  // For row, render the actions dropdown with delete option
  return (
    <div className='px-3 text-right'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='dm-card-table-body-row-actionbtn opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100'
            aria-label='Row actions'
          >
            <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          {onDeleteRow && (
            <DropdownMenuItem
              className='text-destructive focus:text-destructive'
              onClick={() => {
                onDeleteRow(row.index);
              }}
            >
              <Trash2 className='mr-2 h-4 w-4' />
              Delete field
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
