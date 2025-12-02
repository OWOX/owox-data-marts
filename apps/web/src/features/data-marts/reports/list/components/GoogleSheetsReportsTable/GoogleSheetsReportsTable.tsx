import { useEffect, useMemo } from 'react';
import { getGoogleSheetsColumns } from './columns';
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
  getSortedRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { useReport } from '../../../shared';
import { DataDestinationType } from '../../../../../data-destination';
import { useTableStorage } from '../../../../../../hooks/useTableStorage';
import type { DataDestination } from '../../../../../data-destination';

interface GoogleSheetsReportsTableProps {
  destination: DataDestination;
  onEditReport: (report: DataMartReport) => void;
}

/**
 * GoogleSheetsReportsTable
 * - Displays all reports for a Google Sheets destination
 * - Handles sorting, column visibility, and polling for updates
 * - Delegates edit actions to parent via onEditReport
 */
export function GoogleSheetsReportsTable({
  destination,
  onEditReport,
}: GoogleSheetsReportsTableProps) {
  const { reports, setPollingConfig } = useReport();

  // Filter only Google Sheets reports for this destination
  const googleSheetsReports = useMemo(() => {
    return reports.filter(
      report =>
        report.dataDestination.type === DataDestinationType.GOOGLE_SHEETS &&
        report.dataDestination.id === destination.id
    );
  }, [reports, destination.id]);

  // Configure polling
  useEffect(() => {
    setPollingConfig({
      initialPollingIntervalMs: 2000, // 2 seconds
      initialPollCount: 3,
      regularPollingIntervalMs: 5000, // 5 seconds
    });
  }, [setPollingConfig]);

  // Define table columns
  const columns = useMemo(
    () =>
      getGoogleSheetsColumns({
        onDeleteSuccess: () => {
          return;
        },
        onEditReport, // directly use the parent callback
      }),
    [onEditReport]
  );

  // Manage table state with local storage
  const { sorting, setSorting, columnVisibility, setColumnVisibility } = useTableStorage({
    columns,
    storageKeyPrefix: `data-mart-google-sheets-reports-${destination.id}`,
    defaultSortingColumn: 'lastRunDate',
  });

  const table = useReactTable<DataMartReport>({
    data: googleSheetsReports,
    columns: columns as ColumnDef<DataMartReport>[],
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: { sorting, columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  });

  // Generate unique IDs for accessibility
  const tableId = `google-sheets-reports-table-${destination.id}`;

  return (
    <div className='w-full'>
      <div className='dm-card-table-wrap'>
        <Table
          id={tableId}
          className='dm-card-table'
          role='table'
          aria-label={`${destination.title} reports`}
        >
          <TableHeader className='dm-card-table-header'>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className='dm-card-table-header-row'>
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    style={
                      header.column.id === 'actions'
                        ? { width: 80, minWidth: 80, maxWidth: 80 }
                        : { width: `${String(header.column.getSize())}%` }
                    }
                    scope='col'
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
                  onClick={() => {
                    const report = reports.find(r => r.id === row.original.id);
                    if (report) {
                      onEditReport(report);
                    }
                  }}
                  className='dm-card-table-body-row group'
                  role='row'
                  aria-rowindex={rowIndex + 1}
                >
                  {row.getVisibleCells().map((cell, cellIndex) => (
                    <TableCell
                      key={cell.id}
                      className={`px-6 whitespace-normal ${cell.column.id === 'actions' ? 'actions-cell' : ''}`}
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
                    No reports for this destination
                  </span>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
