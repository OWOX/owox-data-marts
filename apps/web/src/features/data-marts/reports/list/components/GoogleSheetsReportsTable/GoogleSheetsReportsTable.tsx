import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useEditModal, useTableFilter, useColumnVisibility } from '../../model/hooks';
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
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table';
import { Toaster } from 'react-hot-toast';
import { GoogleSheetsReportEditSheet } from '../../../edit';
import { TableToolbar } from '../TableToolbar';
import { TablePagination } from '../TablePagination';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';
import { useReport } from '../../../shared';
import { ReportStatusEnum } from '../../../shared';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../../edit/model/context/types.ts';

export function GoogleSheetsReportsTable() {
  const { dataMart } = useOutletContext<DataMartContextType>();
  const {
    fetchReportsByDataMartId,
    reports,
    startPollingReport,
    stopAllPolling,
    setPollingConfig,
  } = useReport();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lastRunDate', desc: true }]);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const { editOpen, handleAddReport, editMode, handleEditRow, handleCloseEditForm, getEditReport } =
    useEditModal();

  const editReport = getEditReport(reports);
  // Refs to track polling state
  const processedReportsRef = useRef(false);
  const prevRunningReportIdsRef = useRef<string[]>([]);
  const reportsRef = useRef<DataMartReport[]>([]);

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

  // Start polling for any reports with RUNNING status
  useEffect(() => {
    // This effect runs when the component mounts or when dataMart changes

    // Stop all polling first to avoid duplicate polling
    stopAllPolling();

    // Reset the refs when dataMart changes
    // This ensures we process the new reports for the new dataMart
    processedReportsRef.current = false;
    prevRunningReportIdsRef.current = [];

    // Clean up polling when component unmounts
    return () => {
      stopAllPolling();
    };
  }, [dataMart?.id, stopAllPolling]);

  // Update reportsRef whenever reports changes
  useEffect(() => {
    reportsRef.current = reports;
  }, [reports]);

  // This effect handles starting polling for reports with RUNNING status
  // It uses refs to avoid processing reports multiple times and to track which reports are running
  useEffect(() => {
    // Skip if no reports
    if (reportsRef.current.length === 0) return;

    // Get IDs of currently running reports
    const runningReportIds = reportsRef.current
      .filter(report => report.lastRunStatus === ReportStatusEnum.RUNNING)
      .map(report => report.id);

    // Check if there are any new running reports that weren't running before
    const hasNewRunningReport = runningReportIds.some(
      id => !prevRunningReportIdsRef.current.includes(id)
    );

    // Only process reports if they haven't been processed yet or if there's a new running report
    if (!processedReportsRef.current || hasNewRunningReport) {
      // Start polling only for new running reports that aren't already being polled
      runningReportIds.forEach(reportId => {
        if (!prevRunningReportIdsRef.current.includes(reportId)) {
          startPollingReport(reportId);
        }
      });

      // Mark reports as processed
      processedReportsRef.current = true;
    }

    // Update the ref with current running report IDs for next comparison
    prevRunningReportIdsRef.current = runningReportIds;
  }, [startPollingReport]);

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

  const { columnVisibility, setColumnVisibility } = useColumnVisibility(columns);

  const table = useReactTable<DataMartReport>({
    data: reports,
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
      <div className='rounded-md border-b border-gray-200 bg-white transition-shadow duration-200 hover:shadow-sm dark:border-0 dark:bg-white/4'>
        <Table
          id={tableId}
          className='w-full table-fixed'
          role='table'
          aria-label='Google Sheets reports'
        >
          <TableHeader className='rounded-tl-md rounded-tr-md border-0 border-b bg-transparent dark:bg-transparent'>
            {table.getHeaderGroups().map(headerGroup => {
              return (
                <TableRow
                  key={headerGroup.id}
                  className='bg-muted/50 border-b hover:bg-white dark:bg-white/2 dark:hover:bg-white/10'
                >
                  {headerGroup.headers.map(header => {
                    return (
                      <TableHead
                        key={header.id}
                        className={getAlignClass(
                          (header.column.columnDef as { _align?: Align })._align
                        )}
                        style={{ width: header.getSize() }}
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
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row, rowIndex) => {
                return (
                  <TableRow
                    key={row.id}
                    onClick={() => {
                      handleEditRow(row.original.id);
                    }}
                    className='cursor-pointer'
                    role='row'
                    aria-rowindex={rowIndex + 1}
                  >
                    {row.getVisibleCells().map((cell, cellIndex) => {
                      return (
                        <TableCell
                          key={cell.id}
                          className={`pl-4 whitespace-normal ${getAlignClass((cell.column.columnDef as { _align?: Align })._align)}`}
                          style={{ width: cell.column.getSize() }}
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
                <TableCell colSpan={columns.length} className='h-24 text-center' role='cell'>
                  <span role='status' aria-live='polite'>
                    No results.
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
