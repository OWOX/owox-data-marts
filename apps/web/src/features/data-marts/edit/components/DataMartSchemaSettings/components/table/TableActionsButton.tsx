import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { type ColumnMeta, type Table } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';

import { TableSelectionCheckbox } from '../../../../../../../shared/components/Table';

/**
 * Extend the ColumnMeta type to include the title property
 */
interface ExtendedColumnMeta<TData> extends ColumnMeta<TData, unknown> {
  title?: string;
}

/**
 * Props for the TableActionsButton component
 */
interface TableActionsButtonProps<TData> {
  /** The table instance */
  table: Table<TData>;
}

/**
 * Component that provides a dropdown menu for toggling column visibility in table headers
 */
export function TableActionsButton<TData>({ table }: TableActionsButtonProps<TData>) {
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
                    <TableSelectionCheckbox
                      checked={column.getIsVisible()}
                      ariaLabel={`Toggle column ${column.columnDef.meta ? ((column.columnDef.meta as ExtendedColumnMeta<TData>).title ?? column.id) : column.id}`}
                      onClick={() => {
                        column.toggleVisibility(!column.getIsVisible());
                      }}
                    />
                    <span>
                      {column.columnDef.meta
                        ? ((column.columnDef.meta as ExtendedColumnMeta<TData>).title ?? column.id)
                        : column.id}
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
