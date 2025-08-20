import { useEffect, useMemo } from 'react';
import { useEditModal } from '../../model/hooks';
import { getGoogleSheetsColumns, getAlignClass, type Align } from './columns';
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
import { Toaster } from 'react-hot-toast';
import { GoogleSheetsReportEditSheet } from '../../../edit';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { useReport } from '../../../shared';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../../edit/model/context/types';
import { DataDestinationType } from '../../../../../data-destination';
import { useTableStorage } from '../../../../../../hooks/useTableStorage';
import type { DataDestination } from '../../../../../data-destination/shared/model/types';

interface GoogleSheetsReportsTableProps {
  destination: DataDestination;
  onEditReport: (report: DataMartReport) => void;
}

export function GoogleSheetsReportsTable({
  destination,
  onEditReport,
}: GoogleSheetsReportsTableProps) {
  const { dataMart } = useOutletContext<DataMartContextType>();
  const { fetchReportsByDataMartId, reports, stopAllPolling, setPollingConfig } = useReport();
  const { editOpen, editMode, handleCloseEditForm, getEditReport } = useEditModal();

  const googleSheetsReports = useMemo(() => {
    return reports.filter(
      report =>
        report.dataDestination.type === DataDestinationType.GOOGLE_SHEETS &&
        report.dataDestination.id === destination.id
    );
  }, [reports, destination.id]);

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
        onEditReport: (report: DataMartReport) => {
          onEditReport(report);
        },
      }),
    [onEditReport]
  );

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
      <Toaster />
      <div className='dm-card-table-wrap'>
        <Table
          id={tableId}
          className='dm-card-table'
          role='table'
          aria-label={`${destination.title} reports`}
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
                      const report = reports.find(r => r.id === row.original.id);
                      if (report) {
                        onEditReport(report);
                      }
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
                    No reports for this destination
                  </span>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <GoogleSheetsReportEditSheet
        isOpen={editOpen}
        onClose={handleCloseEditForm}
        initialReport={editReport}
        mode={editMode}
      />
    </div>
  );
}
