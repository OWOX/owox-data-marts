import { Search, Settings2, Plus, Check } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@owox/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { Table } from '@tanstack/react-table';
import { DataMartStatus } from '../../../../shared';
import type { DataMartStatusInfo } from '../../../../shared';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';

interface TableToolbarProps {
  table: Table<DataMartReport>;
  searchInputId: string;
  columnsMenuId: string;
  columnsMenuOpen: boolean;
  setColumnsMenuOpen: (open: boolean) => void;
  onAddReport: () => void;
  filterValue: string;
  onFilterChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  dataMartStatus?: DataMartStatusInfo;
}

/**
 * Table toolbar component containing search, column visibility menu, and add button
 */
export function TableToolbar({
  table,
  searchInputId,
  columnsMenuId,
  columnsMenuOpen,
  setColumnsMenuOpen,
  onAddReport,
  filterValue,
  onFilterChange,
  dataMartStatus,
}: TableToolbarProps) {
  return (
    <div className='flex items-center justify-between pb-4'>
      <div className='flex items-center gap-2'>
        <div className='relative w-sm'>
          <Search
            className='text-muted-foreground absolute top-2.5 left-2 h-4 w-4'
            aria-hidden='true'
          />
          <Input
            id={searchInputId}
            placeholder='Search by report title'
            value={filterValue}
            onChange={onFilterChange}
            className='border-muted rounded-md border bg-white pl-8 dark:bg-white/4'
            aria-label='Search reports by title'
          />
        </div>
        <DropdownMenu open={columnsMenuOpen} onOpenChange={setColumnsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant='outline'
              className='ml-2 h-8 px-2 font-normal'
              aria-label='Show columns'
              aria-haspopup='true'
              aria-expanded={columnsMenuOpen}
              aria-controls={columnsMenuId}
            >
              <Settings2 className='h-4 w-4' aria-hidden='true' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent id={columnsMenuId} align='start' role='menu'>
            <DropdownMenuItem
              disabled
              className='cursor-default opacity-70 select-none'
              role='menuitem'
            >
              Toggle columns
            </DropdownMenuItem>
            {table
              .getAllColumns()
              .filter(function (column) {
                return column.getCanHide();
              })
              .map(column => {
                return (
                  <DropdownMenuItem
                    key={column.id}
                    className='flex items-center gap-2 capitalize'
                    onClick={() => {
                      column.toggleVisibility(!column.getIsVisible());
                    }}
                    role='menuitemcheckbox'
                    aria-checked={column.getIsVisible()}
                  >
                    <span
                      className={`mr-2 flex h-4 w-4 items-center justify-center rounded border ${column.getIsVisible() ? 'bg-primary border-primary' : ''}`}
                      aria-hidden='true'
                    >
                      {column.getIsVisible() && <Check className='h-3 w-3 text-white' />}
                    </span>
                    {column.id}
                  </DropdownMenuItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className='inline-block'>
            <Button
              variant='outline'
              className='flex h-8 items-center gap-2 px-3'
              onClick={onAddReport}
              aria-label='Add new Google Sheets report'
              disabled={dataMartStatus?.code === DataMartStatus.DRAFT}
            >
              <Plus className='h-4 w-4' aria-hidden='true' />
              Add report
            </Button>
          </div>
        </TooltipTrigger>
        {dataMartStatus?.code === DataMartStatus.DRAFT && (
          <TooltipContent>
            <p>Reports can only be created for published data marts</p>
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  );
}
