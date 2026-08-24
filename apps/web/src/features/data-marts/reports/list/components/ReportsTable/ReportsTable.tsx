import { useEffect, useMemo, useRef } from 'react';
import { getReportColumns } from './columns';
import type { Row } from '@tanstack/react-table';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { useReport } from '../../../shared';
import { canCreateReportInApp, type DataDestination } from '../../../../../data-destination';
import { useBaseTable } from '../../../../../../shared/hooks';
import { BaseTable } from '../../../../../../shared/components/Table';
import { AddReportButton } from '../DestinationCard/AddReportButton';
import { useRefreshSetupProgress } from '../../../../../../components/AppSidebar/SetupChecklist/useSetupProgress';
import { ReportStatusEnum } from '../../../shared/enums';

interface ReportsTableProps {
  destination: DataDestination;
  onEditReport: (report: DataMartReport) => void;
  onAddReport: () => void;
}

/**
 * ReportsTable
 * - Displays all reports for one destination, Google Sheets or Excel
 * - Handles sorting, column visibility, and polling for updates
 * - Delegates edit actions to parent via onEditReport
 *
 * Not tied to a destination type: no column is destination-specific, and the open-document
 * action hides itself for a config that names no document.
 */
export function ReportsTable({ destination, onEditReport, onAddReport }: ReportsTableProps) {
  const { reports, setPollingConfig } = useReport();

  // The reports belonging to this destination, read off the destination itself: a separate type
  // prop would be a second answer to a question this one already answers.
  const filteredReports = useMemo(() => {
    return reports.filter(
      report =>
        report.dataDestination.type === destination.type &&
        report.dataDestination.id === destination.id
    );
  }, [reports, destination.id, destination.type]);

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
    const hasSuccessfulReport = filteredReports.some(
      report => report.lastRunStatus === ReportStatusEnum.SUCCESS
    );

    if (hasSuccessfulReport) {
      hasRefreshedRef.current = true;
      refreshSetupProgress();
    }
  }, [filteredReports, refreshSetupProgress]);

  // Define table columns
  const columns = useMemo(
    () =>
      getReportColumns({
        onDeleteSuccess: () => {
          return;
        },
        onEditReport, // directly use the parent callback
      }),
    [onEditReport]
  );

  // Initialize table with shared hook
  const { table } = useBaseTable<DataMartReport>({
    data: filteredReports,
    columns,
    // Keeps the old name on purpose: this is where a user's saved column layout lives, and
    // renaming the key would silently discard it.
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

  const tableId = `reports-table-${destination.id}`;

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
          {/* Offering a button that cannot make a working report would be worse than saying
              where reports come from — see canCreateReportInApp. */}
          {canCreateReportInApp(destination.type) ? (
            <>
              <p className='text-muted-foreground text-sm font-medium'>
                Create your first report for this destination
              </p>
              <AddReportButton onAddReport={onAddReport} />
            </>
          ) : (
            <p className='text-muted-foreground text-sm font-medium'>
              Create your first report from the OWOX add-in in Excel
            </p>
          )}
        </div>
      )}
    />
  );
}
