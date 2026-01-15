import { useState, useCallback, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';
import { getScheduledTriggerColumns } from './columns';
import { TablePagination } from './TablePagination';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import { ScheduledTriggerFormSheet } from '../ScheduledTriggerFormSheet/ScheduledTriggerFormSheet';
import { useTableStorage } from '../../../../../hooks/useTableStorage';

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
  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);

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

  const { sorting, setSorting, columnVisibility, setColumnVisibility } = useTableStorage({
    columns,
    storageKeyPrefix: 'data-mart-scheduled-triggers',
    defaultSortingColumn: 'type',
  });

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

  const handlePreviousClick = useCallback(() => {
    table.previousPage();
  }, [table]);

  const handleNextClick = useCallback(() => {
    table.nextPage();
  }, [table]);

  // Generate unique IDs for accessibility
  const tableId = 'scheduled-triggers-table';

  return (
    <>
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
                        className='[&:has([role=checkbox])]:pl-6 [&>[role=checkbox]]:translate-y-[2px]'
                        scope='col'
                        style={
                          header.column.id === 'type'
                            ? { width: 150, minWidth: 150, maxWidth: 150 }
                            : header.column.id === 'actions'
                              ? { width: 80, minWidth: 80, maxWidth: 80 }
                              : { width: `${String(header.getSize())}%` }
                        }
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
                          className={`whitespace-normal ${cell.column.id === 'actions' ? 'actions-cell' : ''}`}
                          role='cell'
                          aria-colindex={cellIndex + 1}
                          style={
                            cell.column.id === 'type'
                              ? { width: 150, minWidth: 150, maxWidth: 150 }
                              : cell.column.id === 'actions'
                                ? { width: 80, minWidth: 80, maxWidth: 80 }
                                : { width: `${String(cell.column.getSize())}%` }
                          }
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
                    No scheduled triggers yet. Create a trigger to automate data updates
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
