import { useEffect, useState, useMemo, useCallback } from 'react';
import { useEditModal, useTableFilter } from '../../model/hooks';
import { getGoogleSheetsColumns, getAlignClass, type Align } from '../columns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import { Toaster } from 'react-hot-toast';
import { GoogleSheetsReportEditSheet } from '../../../edit';
import { TableToolbar } from '../TableToolbar';
import { TablePagination } from '../TablePagination';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';
import { useReport } from '../../../shared';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../../edit/model/context/types.ts';
import { DataDestinationType } from '../../../../../data-destination';
import { useTableStorage } from '../../../../../../hooks/useTableStorage';

export function GoogleSheetsReportsTable() {
  const { dataMart } = useOutletContext<DataMartContextType>();
  const { fetchReportsByDataMartId, reports, stopAllPolling, setPollingConfig } = useReport();
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const { editOpen, handleAddReport, editMode, handleEditRow, handleCloseEditForm, getEditReport } =
    useEditModal();

  const googleSheetsReports = useMemo(() => {
    return reports.filter(
      report => report.dataDestination.type === DataDestinationType.GOOGLE_SHEETS
    );
  }, [reports]);

  const editReport = getEditReport(reports);

  // Set polling configuration
  useEffect(() => {
    setPollingConfig({
      initialPollingIntervalMs: 2000, // 2 seconds
      initialPollCount: 3,
      regularPollingIntervalMs: 5000, // 5 seconds
    });
  }, [setPollingConfig]);

  // Fetch reports when dataMart changes
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!dataMart) return;
        await fetchReportsByDataMartId(dataMart.id);
      } catch (err) {
        console.error(err);
      }
    };

    void fetchData();
  }, [fetchReportsByDataMartId, dataMart]);

  useEffect(() => {
    // Clean up polling when component unmounts
    return () => {
      stopAllPolling();
    };
  }, [dataMart?.id, stopAllPolling]);

  const columns = useMemo(
    () =>
      getGoogleSheetsColumns({
        onDeleteSuccess: () => {
          return;
        },
        onEditReport: handleEditRow,
      }),
    [handleEditRow]
  );

  const { sorting, setSorting, columnVisibility, setColumnVisibility } = useTableStorage({
    columns,
    storageKeyPrefix: 'data-mart-google-sheets-reports',
    defaultSortingColumn: 'lastRunDate',
  });

  const table = useReactTable<DataMartReport>({
    data: googleSheetsReports,
    columns: columns as ColumnDef<DataMartReport>[],
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: { sorting, columnVisibility },
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
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
  const searchInputId = 'google-sheets-search-input';
  const columnsMenuId = 'google-sheets-columns-menu';
  const tableId = 'google-sheets-reports-table';

  return (
    <div className='w-full'>
      <Toaster />
      <TableToolbar
        table={table}
        searchInputId={searchInputId}
        columnsMenuId={columnsMenuId}
        columnsMenuOpen={columnsMenuOpen}
        setColumnsMenuOpen={setColumnsMenuOpen}
        onAddReport={handleAddReport}
        filterValue={filterValue}
        onFilterChange={handleFilterChange}
        dataMartStatus={dataMart?.status}
      />
      <div className='dm-card-table-wrap'>
        <Table
          id={tableId}
          className='dm-card-table'
          role='table'
          aria-label='Google Sheets reports'
        >
          <TableHeader className='dm-card-table-header'>
            {table.getHeaderGroups().map(headerGroup => {
              return (
                <TableRow key={headerGroup.id} className='dm-card-table-header-row'>
                  {headerGroup.headers.map(header => {
                    return (
                      <TableHead
                        key={header.id}
                        className={getAlignClass(
                          (header.column.columnDef as { _align?: Align })._align
                        )}
                        style={
                          header.column.id === 'actions'
                            ? { width: 80, minWidth: 80, maxWidth: 80 }
                            : { width: `${String(header.getSize())}%` }
                        }
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
                      handleEditRow(row.original.id);
                    }}
                    className='dm-card-table-body-row group'
                    role='row'
                    aria-rowindex={rowIndex + 1}
                  >
                    {row.getVisibleCells().map((cell, cellIndex) => {
                      return (
                        <TableCell
                          key={cell.id}
                          className={`px-6 whitespace-normal ${getAlignClass((cell.column.columnDef as { _align?: Align })._align)}`}
                          style={
                            cell.column.id === 'actions'
                              ? { width: 80, minWidth: 80, maxWidth: 80 }
                              : { width: `${String(cell.column.getSize())}%` }
                          }
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
                    No results
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
      <GoogleSheetsReportEditSheet
        isOpen={editOpen}
        onClose={handleCloseEditForm}
        initialReport={editReport}
        mode={editMode}
      />
    </div>
  );
}
