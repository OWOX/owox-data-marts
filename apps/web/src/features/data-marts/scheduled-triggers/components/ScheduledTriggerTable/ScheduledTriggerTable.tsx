import { useState, useCallback, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type SortingState,
} from '@tanstack/react-table';
import { useColumnVisibility } from '../../hooks';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';
import { getScheduledTriggerColumns } from './columns';
import { TableToolbar } from './TableToolbar';
import { TablePagination } from './TablePagination';
import { useTableFilter } from './hooks/useTableFilter';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import { ScheduledTriggerFormSheet } from '../ScheduledTriggerFormSheet/ScheduledTriggerFormSheet';

interface ScheduledTriggerTableProps {
  triggers: ScheduledTrigger[];
  dataMartId: string;
  onEditTrigger: (id: string) => void;
  onDeleteTrigger: (id: string) => void;
}

export function ScheduledTriggerTable({
  triggers,
  dataMartId,
  onEditTrigger,
  onDeleteTrigger,
}: ScheduledTriggerTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'type', desc: false }]);
  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);

  const handleOpenFormSheet = useCallback(() => {
    setIsFormSheetOpen(true);
  }, []);

  const handleCloseFormSheet = useCallback(() => {
    setIsFormSheetOpen(false);
  }, []);

  const handleDeleteClick = useCallback(
    (id: string) => {
      onDeleteTrigger(id);
    },
    [onDeleteTrigger]
  );

  const columns = useMemo(
    () =>
      getScheduledTriggerColumns({
        onEditTrigger,
        onDeleteTrigger: handleDeleteClick,
      }),
    [onEditTrigger, handleDeleteClick]
  );

  const { columnVisibility, setColumnVisibility } = useColumnVisibility(columns);

  const table = useReactTable<ScheduledTrigger>({
    data: triggers,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { sorting, columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    enableGlobalFilter: true,
    enableColumnResizing: false,
  });

  // Table filter hook
  const { value: filterValue, onChange: handleFilterChange } = useTableFilter(table);

  const handlePreviousClick = useCallback(() => {
    table.previousPage();
  }, [table]);

  const handleNextClick = useCallback(() => {
    table.nextPage();
  }, [table]);

  // Generate unique IDs for accessibility
  const searchInputId = 'scheduled-triggers-search-input';
  const tableId = 'scheduled-triggers-table';

  return (
    <>
      <TableToolbar
        table={table}
        searchInputId={searchInputId}
        onAddTrigger={handleOpenFormSheet}
        filterValue={filterValue}
        onFilterChange={handleFilterChange}
      />
      <div className='dm-card-table-wrap'>
        <Table id={tableId} className='dm-card-table' role='table' aria-label='Scheduled Triggers'>
          <TableHeader className='dm-card-table-header'>
            {table.getHeaderGroups().map(headerGroup => {
              return (
                <TableRow key={headerGroup.id} className='dm-card-table-header-row'>
                  {headerGroup.headers.map(header => {
                    return (
                      <TableHead
                        key={header.id}
                        className='[&:has([role=checkbox])]:pl-5 [&>[role=checkbox]]:translate-y-[2px]'
                        scope='col'
                      >
                        {header.isPlaceholder
                          ? null
                          : typeof header.column.columnDef.header === 'function'
                            ? header.column.columnDef.header(header.getContext())
                            : header.column.columnDef.header}
                      </TableHead>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableHeader>
          <TableBody className='dm-card-table-body'>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row, rowIndex) => {
                return (
                  <TableRow
                    key={row.id}
                    onClick={() => {
                      onEditTrigger(row.original.id);
                    }}
                    className='dm-card-table-body-row group'
                    role='row'
                    aria-rowindex={rowIndex + 1}
                  >
                    {row.getVisibleCells().map((cell, cellIndex) => {
                      return (
                        <TableCell
                          key={cell.id}
                          className={`px-5 whitespace-normal ${cell.column.id === 'actions' ? 'actions-cell' : ''}`}
                          role='cell'
                          aria-colindex={cellIndex + 1}
                        >
                          {typeof cell.column.columnDef.cell === 'function'
                            ? cell.column.columnDef.cell(cell.getContext())
                            : cell.column.columnDef.cell}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='dm-card-table-body-row-empty'
                  role='cell'
                >
                  <span role='status' aria-live='polite'>
                    No scheduled triggers found.
                  </span>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination
        table={table}
        onPreviousClick={handlePreviousClick}
        onNextClick={handleNextClick}
      />
      <ScheduledTriggerFormSheet
        isOpen={isFormSheetOpen}
        onClose={handleCloseFormSheet}
        dataMartId={dataMartId}
      />
    </>
  );
}
