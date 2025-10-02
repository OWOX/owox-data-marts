import { type Table } from '@tanstack/react-table';
import { MoreHorizontal, Check } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { DataMartColumnKey } from '../columns/columnKeys';
import { dataMartColumnLabels } from '../columns/columnLabels';

interface ToggleColumnsHeaderProps<TData> {
  table: Table<TData>;
}

export function ToggleColumnsHeader<TData>({ table }: ToggleColumnsHeaderProps<TData>) {
  return (
    <div className='px-4 text-right'>
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
              const label = dataMartColumnLabels[column.id as DataMartColumnKey] || column.id;
              return (
                <DropdownMenuItem key={column.id} className='capitalize'>
                  <label className='flex items-center space-x-2'>
                    <button
                      type='button'
                      role='checkbox'
                      aria-checked={column.getIsVisible()}
                      data-state={column.getIsVisible() ? 'checked' : 'unchecked'}
                      aria-label={`Toggle column ${column.id}`}
                      className='peer border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border bg-white shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/8'
                      onClick={() => {
                        column.toggleVisibility(!column.getIsVisible());
                      }}
                    >
                      {column.getIsVisible() && (
                        <span
                          data-state='checked'
                          data-slot='checkbox-indicator'
                          className='pointer-events-none flex items-center justify-center text-current transition-none'
                        >
                          <Check className='size-3.5 text-white' />
                        </span>
                      )}
                    </button>
                    <span>{label}</span>
                  </label>
                </DropdownMenuItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
