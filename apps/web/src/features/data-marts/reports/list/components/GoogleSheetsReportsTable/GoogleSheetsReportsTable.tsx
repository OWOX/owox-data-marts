import { useEffect, useMemo, useRef } from 'react';
import { getGoogleSheetsColumns } from './columns';
import type { Row } from '@tanstack/react-table';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { useReport } from '../../../shared';
import { DataDestinationType } from '../../../../../data-destination';
import type { DataDestination } from '../../../../../data-destination';
import { useBaseTable } from '../../../../../../shared/hooks';
import { BaseTable } from '../../../../../../shared/components/Table';
import { AddReportButton } from '../DestinationCard/AddReportButton';
import type { DataMartStatusInfo } from '../../../../shared/types/data-mart-status.model';
import { useRefreshSetupProgress } from '../../../../../../components/AppSidebar/SetupChecklist/useSetupProgress';
import { ReportStatusEnum } from '../../../shared/enums';

interface GoogleSheetsReportsTableProps {
  destination: DataDestination;
  onEditReport: (report: DataMartReport) => void;
  dataMartStatus?: DataMartStatusInfo;
  onAddReport: () => void;
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
  dataMartStatus,
  onAddReport,
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

  // Refresh setup progress when a successful report is found
  const refreshSetupProgress = useRefreshSetupProgress();
  const hasRefreshedRef = useRef(false);
  useEffect(() => {
    if (hasRefreshedRef.current) return;
    const hasSuccessfulReport = googleSheetsReports.some(
      report => report.lastRunStatus === ReportStatusEnum.SUCCESS
    );

    if (hasSuccessfulReport) {
      hasRefreshedRef.current = true;
      refreshSetupProgress();
    }
  }, [googleSheetsReports, refreshSetupProgress]);

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

  // Initialize table with shared hook
  const { table } = useBaseTable<DataMartReport>({
    data: googleSheetsReports,
    columns,
    storageKeyPrefix: `data-mart-google-sheets-reports-${destination.id}`,
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

  const tableId = `google-sheets-reports-table-${destination.id}`;

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
