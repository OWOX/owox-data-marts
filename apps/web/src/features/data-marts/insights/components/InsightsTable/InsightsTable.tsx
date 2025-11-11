import { useCallback, useMemo } from 'react';
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
import { useTableStorage } from '../../../../../hooks/useTableStorage';
import { getInsightColumns, type InsightTableItem } from './columns';
import { Button } from '@owox/ui/components/button';

interface InsightsTableProps {
  items: InsightTableItem[];
  onRowClick: (id: string) => void;
  onDelete: (id: string) => void;
}

export function InsightsTable({ items, onRowClick, onDelete }: InsightsTableProps) {
  const columns = useMemo(() => getInsightColumns({ onDelete }), [onDelete]);

  const { sorting, setSorting, columnVisibility, setColumnVisibility } = useTableStorage({
    columns,
    storageKeyPrefix: 'data-mart-insights',
    defaultSortingColumn: 'lastUpdated',
  });

  const table = useReactTable<InsightTableItem>({
    data: items,
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

  const tableId = 'insights-table';

  return (
    <>
      <div className='dm-card-table-wrap'>
        <Table id={tableId} className='dm-card-table' role='table' aria-label='Insights'>
          <TableHeader className='dm-card-table-header'>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className='dm-card-table-header-row'>
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    className='[&:has([role=checkbox])]:pl-6 [&>[role=checkbox]]:translate-y-[2px]'
                    scope='col'
                    style={
                      header.column.id === 'actions'
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
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className='dm-card-table-body'>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row, rowIndex) => (
                <TableRow
                  key={row.id}
                  onClick={() => onRowClick(row.original.id)}
                  className='dm-card-table-body-row group cursor-pointer'
                  role='row'
                  aria-rowindex={rowIndex + 1}
                >
                  {row.getVisibleCells().map((cell, cellIndex) => (
                    <TableCell
                      key={cell.id}
                      className={`whitespace-normal ${cell.column.id === 'actions' ? 'actions-cell' : ''}`}
                      role='cell'
                      aria-colindex={cellIndex + 1}
                      style={
                        cell.column.id === 'actions'
                          ? { width: 80, minWidth: 80, maxWidth: 80 }
                          : { width: `${String(cell.column.getSize())}%` }
                      }
                    >
                      {typeof cell.column.columnDef.cell === 'function'
                        ? cell.column.columnDef.cell(cell.getContext())
                        : cell.column.columnDef.cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='dm-card-table-body-row-empty'
                  role='cell'
                >
                  <span role='status' aria-live='polite'>
                    No insights found.
                  </span>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className='dm-card-pagination' role='navigation' aria-label='Table pagination'>
        <Button
          variant='outline'
          size='sm'
          onClick={handlePreviousClick}
          disabled={!table.getCanPreviousPage()}
          aria-label='Go to previous page'
        >
          Previous
        </Button>

        <Button
          variant='outline'
          size='sm'
          onClick={handleNextClick}
          disabled={!table.getCanNextPage()}
          aria-label='Go to next page'
        >
          Next
        </Button>
      </div>
    </>
  );
}
