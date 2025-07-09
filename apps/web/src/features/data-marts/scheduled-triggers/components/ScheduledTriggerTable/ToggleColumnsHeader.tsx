import { type Table, type ColumnMeta } from '@tanstack/react-table';
import { MoreHorizontal, Check } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';

// Extend the ColumnMeta type to include the title property
interface ExtendedColumnMeta<TData> extends ColumnMeta<TData, unknown> {
  title?: string;
}

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
                    <button
                      type='button'
                      role='checkbox'
                      aria-checked={column.getIsVisible()}
                      data-state={column.getIsVisible() ? 'checked' : 'unchecked'}
                      aria-label={`Toggle column ${(column.columnDef.meta as ExtendedColumnMeta<TData>).title ?? column.id}`}
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
                          <Check className='size-3.5' />
                        </span>
                      )}
                    </button>
                    <span>
                      {(column.columnDef.meta as ExtendedColumnMeta<TData>).title ?? column.id}
                    </span>
                  </label>
                </DropdownMenuItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
