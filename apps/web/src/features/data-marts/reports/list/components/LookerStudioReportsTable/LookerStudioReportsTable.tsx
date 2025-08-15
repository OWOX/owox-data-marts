import { useEffect, useState, useMemo } from 'react';
import { useEditModal, useColumnVisibility } from '../../model/hooks';
import { getLookerStudioColumns, getAlignClass, type Align } from '../columns';
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
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table';
import { LookerStudioReportEditSheet } from '../../../edit';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';
import { useReport } from '../../../shared';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../../edit/model/context/types.ts';
import { DataDestinationType } from '../../../../../data-destination';
import type { DataDestinationResponseDto } from '../../../../../data-destination/shared/services/types';

interface LookerStudioReportsTableProps {
  destination: DataDestinationResponseDto;
  onEditReport: (report: DataMartReport) => void;
}

export function LookerStudioReportsTable({
  destination,
  onEditReport,
}: LookerStudioReportsTableProps) {
  const { dataMart } = useOutletContext<DataMartContextType>();
  const { fetchReportsByDataMartId, reports } = useReport();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lastRunDate', desc: true }]);
  const { editOpen, editMode, handleCloseEditForm, getEditReport } = useEditModal();

  // Filter reports to only show Looker Studio reports
  const lookerStudioReports = useMemo(() => {
    return reports.filter(
      report =>
        report.dataDestination.type === DataDestinationType.LOOKER_STUDIO &&
        report.dataDestination.id === destination.id
    );
  }, [reports, destination.id]);

  const editReport = getEditReport(lookerStudioReports);

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

  const columns = useMemo(
    () =>
      getLookerStudioColumns({
        onDeleteSuccess: () => {
          return;
        },
        onEditReport: (report: DataMartReport) => {
          onEditReport(report);
        },
      }),
    [onEditReport]
  );

  const { columnVisibility, setColumnVisibility } = useColumnVisibility(columns);

  const table = useReactTable<DataMartReport>({
    data: lookerStudioReports,
    columns: columns as ColumnDef<DataMartReport>[],
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: { sorting, columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  });

  // Generate unique IDs for accessibility
  const tableId = `looker-studio-reports-table-${destination.id}`;

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
      <LookerStudioReportEditSheet
        isOpen={editOpen}
        onClose={handleCloseEditForm}
        initialReport={editReport}
        mode={editMode}
      />
    </div>
  );
}
