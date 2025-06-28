import { type Table } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';

interface ToggleColumnsHeaderProps<TData> {
  table: Table<TData>;
}

export function ToggleColumnsHeader<TData>({ table }: ToggleColumnsHeaderProps<TData>) {
  return (
    <div className='px-3 text-right'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='dm-card-table-body-row-actionbtn'
            aria-label='Toggle columns'
          >
            <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          {table
            .getAllColumns()
            .filter(column => column.getCanHide() && column.id !== 'actions')
            .map(column => {
              return (
                <DropdownMenuItem key={column.id} className='capitalize'>
                  <label className='flex items-center space-x-2'>
                    <input
                      type='checkbox'
                      checked={column.getIsVisible()}
                      onChange={e => {
                        column.toggleVisibility(e.target.checked);
                      }}
                      className='h-4 w-4'
                    />
                    <span>{column.id}</span>
                  </label>
                </DropdownMenuItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
