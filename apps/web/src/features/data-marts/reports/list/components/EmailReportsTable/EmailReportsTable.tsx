import { useEffect, useMemo } from 'react';
import { getEmailColumns } from './columns';
import type { Row } from '@tanstack/react-table';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { useReport } from '../../../shared';
import { DataDestinationType } from '../../../../../data-destination';
import type { DataDestination } from '../../../../../data-destination';
import { useBaseTable } from '../../../../../../shared/hooks';
import { BaseTable } from '../../../../../../shared/components/Table';
import type { DataMartStatusInfo } from '../../../../shared/types/data-mart-status.model';
import { AddReportButton } from '../DestinationCard/AddReportButton';

interface EmailReportsTableProps {
  destinationType: DataDestinationType;
  destination: DataDestination;
  onEditReport: (report: DataMartReport) => void;
  dataMartStatus?: DataMartStatusInfo;
  onAddReport: () => void;
}

/**
 * EmailReportsTable
 * - Displays all reports for an Email destination
 * - Handles sorting, column visibility, and polling for updates
 * - Delegates edit actions to parent via onEditReport
 */
export function EmailReportsTable({
  destinationType,
  destination,
  onEditReport,
  dataMartStatus,
  onAddReport,
}: EmailReportsTableProps) {
  const { reports, setPollingConfig } = useReport();

  // Filter only Email reports for this destination
  const emailReports = useMemo(() => {
    return reports.filter(
      report =>
        report.dataDestination.type === destinationType &&
        report.dataDestination.id === destination.id
    );
  }, [reports, destination.id, destinationType]);

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
      getEmailColumns({
        onDeleteSuccess: () => {
          return;
        },
        onEditReport, // directly use the parent callback
      }),
    [onEditReport]
  );

  // Initialize table with shared hook
  const { table } = useBaseTable<DataMartReport>({
    data: emailReports,
    columns,
    storageKeyPrefix: `data-mart-email-reports-${destination.id}`,
    defaultSortingColumn: 'lastRunDate',
    enableRowSelection: false,
  });

  // Row click handler
  const handleRowClick = (row: Row<DataMartReport>) => {
    const report = reports.find(r => r.id === row.original.id);
    if (report) {
      onEditReport(report);
    }
  };

  const tableId = `email-reports-table-${destination.id}`;

  return (
    <BaseTable
      tableId={tableId}
      table={table}
      onRowClick={handleRowClick}
      ariaLabel={`${destination.title} reports`}
      showPagination={false}
      renderEmptyState={() => (
        <div
          className='flex flex-col items-center justify-center gap-4 py-8 text-center'
          role='status'
          aria-live='polite'
        >
          <p className='text-muted-foreground text-sm font-medium'>
            Create your first report for this destination
          </p>
          <AddReportButton dataMartStatus={dataMartStatus} onAddReport={onAddReport} />
        </div>
      )}
    />
  );
}
