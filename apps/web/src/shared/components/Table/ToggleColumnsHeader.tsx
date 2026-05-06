import { type Table, type Column, type ColumnMeta } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { TableSelectionCheckbox } from './TableSelectionCheckbox';

interface ExtendedColumnMeta<TData> extends ColumnMeta<TData, unknown> {
  title?: string;
}

export interface ToggleColumnsHeaderProps<TData> {
  table: Table<TData>;
  /** Optional column label resolver. If not provided, falls back to meta.title or id */
  getColumnLabel?: (columnId: string, column: Column<TData>) => string;
}

/**
 * Shared header with dropdown to toggle column visibility for TanStack Table.
 * - Hides non-hideable columns and the special "actions" column
 * - Supports custom labels via `getColumnLabel` and meta.title fallback
 */
export function ToggleColumnsHeader<TData>({
  table,
  getColumnLabel,
}: ToggleColumnsHeaderProps<TData>) {
  return (
    <div className='text-right'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='h-8 transition-colors transition-shadow duration-200 hover:bg-white hover:shadow-xs dark:hover:bg-white/4'
            aria-label='Toggle columns'
          >
            <MoreHorizontal className='text-muted-foreground h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          {table
            .getAllColumns()
            .filter(column => column.getCanHide() && column.id !== 'actions')
            .map(column => {
              const label =
                getColumnLabel?.(column.id, column) ??
                (column.columnDef.meta as ExtendedColumnMeta<TData> | undefined)?.title ??
                column.id;

              return (
                <DropdownMenuItem key={column.id}>
                  <label className='flex items-center space-x-2'>
                    <TableSelectionCheckbox
                      checked={column.getIsVisible()}
                      ariaLabel={`Toggle column ${label}`}
                      onClick={() => {
                        column.toggleVisibility(!column.getIsVisible());
                      }}
                    />
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
