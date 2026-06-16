import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { SkeletonList } from '@owox/ui/components/common/skeleton-list';
import { extractApiError } from '../../../app/api';
import { DataDestinationType, DataDestinationTypeModel } from '../../../features/data-destination';
import { DataMartContext } from '../../../features/data-marts/edit/model/context/context';
import {
  EmailActionsCell,
  GoogleSheetsActionsCell,
  StatusIcon,
} from '../../../features/data-marts/reports/list/components';
import { ReportEditSheetRenderer } from '../../../features/data-marts/reports/list/components/DestinationCard/ReportEditSheetRenderer';
import { useReportSidesheet } from '../../../features/data-marts/reports/list/model/hooks';
import { mapReportDtoToEntity } from '../../../features/data-marts/reports/shared/model/mappers';
import { ReportsProvider } from '../../../features/data-marts/reports/shared/model/context';
import { ReportQuickRunCell } from '../../../features/data-marts/reports/shared';
import type { DataMartReport } from '../../../features/data-marts/reports/shared/model/types/data-mart-report';
import { ReportStatusEnum } from '../../../features/data-marts/reports/shared/enums';
import { reportService } from '../../../features/data-marts/reports/shared/services';
import { BaseTable, SortableHeader, ToggleColumnsHeader } from '../../../shared/components/Table';
import {
  applyFiltersToData,
  type FilterAccessors,
  type FilterConfigItem,
} from '../../../shared/components/TableFilters';
import { collectOptionsFromData } from '../../../shared/components/TableFilters/collectOptions.utils';
import { UserAvatarGroup } from '../../../shared/components/UserAvatarGroup';
import { UserReference } from '../../../shared/components/UserReference';
import { useBaseTable, usePersistentFilters, useProjectRoute } from '../../../shared/hooks';
import { ProjectDataMartTableFilters } from '../shared/ProjectDataMartTableFilters';
import { ProjectDataMartTableSearch } from '../shared/ProjectDataMartTableSearch';
import {
  buildProjectTableUserLabelMapper,
  matchesProjectTableSearch,
} from '../shared/ProjectDataMartTableFilters.utils';
import { buildProjectDataMartContextValue } from '../shared/projectDataMartContext';
import { ProjectDataMartEmptyState } from '../shared/ProjectDataMartEmptyState';
import { ProjectDataMartTitleLink } from '../shared/ProjectDataMartTitleLink';
import { mergeReportPagePreservingRows } from './DataMartReportsPage.utils';

const PROJECT_REPORTS_TABLE_PAGE_SIZE = 15;
const PROJECT_REPORTS_TABLE_ID = 'project-reports-table';

type ProjectReportFilterKey =
  | 'dataMart'
  | 'report'
  | 'destination'
  | 'runStatus'
  | 'createdBy'
  | 'owners';

const projectReportFilterAccessors: FilterAccessors<ProjectReportFilterKey, DataMartReport> = {
  dataMart: row => row.dataMart.title,
  report: row => row.title,
  destination: row => row.dataDestination.title,
  runStatus: row => row.lastRunStatus ?? 'never',
  createdBy: row => row.createdByUser?.userId,
  owners: row => (row.ownerUsers ?? []).map(user => user.userId),
};

function buildProjectReportFilters(
  data: DataMartReport[]
): FilterConfigItem<ProjectReportFilterKey>[] {
  const userLabelMapper = buildProjectTableUserLabelMapper(
    data.flatMap(report => [report.createdByUser, ...(report.ownerUsers ?? [])])
  );

  return [
    {
      id: 'dataMart',
      label: 'Data Mart',
      dataType: 'string',
      operators: ['contains', 'not_contains', 'eq', 'neq'],
      options: collectOptionsFromData(data, projectReportFilterAccessors.dataMart),
    },
    {
      id: 'report',
      label: 'Report',
      dataType: 'string',
      operators: ['contains', 'not_contains', 'eq', 'neq'],
      options: collectOptionsFromData(data, projectReportFilterAccessors.report),
    },
    {
      id: 'destination',
      label: 'Destination',
      dataType: 'string',
      operators: ['contains', 'not_contains', 'eq', 'neq'],
      options: collectOptionsFromData(data, projectReportFilterAccessors.destination),
    },
    {
      id: 'runStatus',
      label: 'Run Status',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(data, projectReportFilterAccessors.runStatus, {
        labelMapper: value => (value === 'never' ? 'Never run' : value),
      }),
    },
    {
      id: 'createdBy',
      label: 'Created By',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(data, projectReportFilterAccessors.createdBy, {
        labelMapper: userLabelMapper,
      }),
    },
    {
      id: 'owners',
      label: 'Owners',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(data, projectReportFilterAccessors.owners, {
        labelMapper: userLabelMapper,
      }),
    },
  ];
}

interface ProjectReportActionsCellProps {
  report: DataMartReport;
  onEditReport: (report: DataMartReport) => void;
  onReportActionComplete: () => void | Promise<void>;
}

function ProjectReportActionsCell({
  report,
  onEditReport,
  onReportActionComplete,
}: ProjectReportActionsCellProps) {
  const dataMartContextValue = useMemo(
    () => buildProjectDataMartContextValue(report.dataMart),
    [report.dataMart]
  );
  const actionProps = {
    row: { original: report },
    onDeleteSuccess: onReportActionComplete,
    onRunSuccess: onReportActionComplete,
    onEditReport,
  };

  let actionsCell: ReactNode = null;

  switch (report.dataDestination.type) {
    case DataDestinationType.GOOGLE_SHEETS:
      actionsCell = <GoogleSheetsActionsCell {...actionProps} />;
      break;
    case DataDestinationType.EMAIL:
    case DataDestinationType.SLACK:
    case DataDestinationType.GOOGLE_CHAT:
    case DataDestinationType.MS_TEAMS:
      actionsCell = <EmailActionsCell {...actionProps} />;
      break;
  }

  return (
    <DataMartContext.Provider value={dataMartContextValue}>{actionsCell}</DataMartContext.Provider>
  );
}

export default function DataMartReportsPage() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { scope } = useProjectRoute();
  const [reports, setReports] = useState<DataMartReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const {
    isOpen: isReportEditSheetOpen,
    mode: reportEditMode,
    editingReport,
    handleEditReport,
    handleCloseModal,
  } = useReportSidesheet();

  const loadReports = useCallback(async (options?: { silent?: boolean }) => {
    const isSilent = options?.silent === true;

    if (!isSilent) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const response = await reportService.getReportsByProject();
      const nextReports = response.map(mapReportDtoToEntity);
      setReports(currentReports => {
        if (!isSilent) {
          return nextReports;
        }

        return mergeReportPagePreservingRows(currentReports, nextReports);
      });
    } catch (caught) {
      if (!isSilent) {
        setError(extractApiError(caught).message ?? 'Failed to fetch Data Mart reports');
      }
    } finally {
      if (!isSilent) {
        setIsLoading(false);
      }
    }
  }, []);

  const refreshReportsByIds = useCallback(async (reportIds: string[]) => {
    const responses = await Promise.allSettled(
      reportIds.map(reportId => reportService.getReportById(reportId))
    );
    const nextReports = responses.flatMap(response =>
      response.status === 'fulfilled' ? [mapReportDtoToEntity(response.value)] : []
    );

    if (nextReports.length === 0) {
      return;
    }

    setReports(currentReports => mergeReportPagePreservingRows(currentReports, nextReports));
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const handleCloseReportEditSheet = useCallback(() => {
    handleCloseModal();
  }, [handleCloseModal]);

  const handleReportActionComplete = useCallback(async () => {
    await loadReports();
  }, [loadReports]);

  const reportDataMartContextValue = useMemo(
    () => (editingReport ? buildProjectDataMartContextValue(editingReport.dataMart) : null),
    [editingReport]
  );

  const filtersConfig = useMemo(() => buildProjectReportFilters(reports), [reports]);

  const { appliedState, apply, clear } = usePersistentFilters<ProjectReportFilterKey>({
    projectId,
    tableId: PROJECT_REPORTS_TABLE_ID,
    urlParam: 'filters',
    config: filtersConfig,
  });

  const filteredReports = useMemo(
    () =>
      applyFiltersToData<ProjectReportFilterKey, DataMartReport>(
        reports,
        appliedState,
        projectReportFilterAccessors
      ),
    [appliedState, reports]
  );

  const searchedReports = useMemo(
    () =>
      filteredReports.filter(report =>
        matchesProjectTableSearch(searchQuery, [
          report.dataMart.title,
          report.title,
          report.dataDestination.title,
          report.lastRunStatus,
          report.createdByUser?.fullName,
          report.createdByUser?.email,
          (report.ownerUsers ?? []).flatMap(user => [user.fullName, user.email]),
        ])
      ),
    [filteredReports, searchQuery]
  );

  const columns = useMemo<ColumnDef<DataMartReport>[]>(
    () => [
      {
        id: 'quickRun',
        size: 50,
        enableResizing: false,
        enableSorting: false,
        enableHiding: false,
        header: () => null,
        cell: ({ row }) => (
          <ReportQuickRunCell report={row.original} onRunSuccess={handleReportActionComplete} />
        ),
      },
      {
        id: 'dataMart',
        accessorFn: row => row.dataMart.title,
        size: 260,
        meta: { title: 'Data Mart' },
        header: ({ column }) => <SortableHeader column={column}>Data Mart</SortableHeader>,
        cell: ({ row }) => (
          <ProjectDataMartTitleLink
            to={scope(`/data-marts/${row.original.dataMart.id}/reports`)}
            title={row.original.dataMart.title}
          />
        ),
      },
      {
        accessorKey: 'title',
        size: 320,
        meta: { title: 'Report' },
        header: ({ column }) => <SortableHeader column={column}>Report</SortableHeader>,
        cell: ({ row }) => {
          const title = row.original.title.trim();
          if (!title) {
            return <span className='text-muted-foreground'>—</span>;
          }
          return <div className='overflow-hidden text-ellipsis'>{title}</div>;
        },
      },
      {
        id: 'destination',
        accessorFn: row => row.dataDestination.title,
        size: 220,
        meta: { title: 'Destination' },
        header: ({ column }) => <SortableHeader column={column}>Destination</SortableHeader>,
        cell: ({ row }) => {
          const { displayName, icon: Icon } = DataDestinationTypeModel.getInfo(
            row.original.dataDestination.type
          );

          return (
            <div className='text-muted-foreground flex min-w-0 items-center gap-2'>
              <Icon size={18} className='shrink-0' />
              <span className='truncate'>{row.original.dataDestination.title || displayName}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'lastRunDate',
        size: 170,
        sortDescFirst: true,
        meta: { title: 'Last Run' },
        header: ({ column }) => <SortableHeader column={column}>Last Run</SortableHeader>,
        cell: ({ row }) => (
          <div className='text-muted-foreground text-sm'>
            {row.original.lastRunDate ? (
              <RelativeTime date={row.original.lastRunDate} />
            ) : (
              'Never run'
            )}
          </div>
        ),
      },
      {
        accessorKey: 'lastRunStatus',
        size: 150,
        meta: { title: 'Run Status' },
        header: ({ column }) => <SortableHeader column={column}>Run Status</SortableHeader>,
        cell: ({ row }) =>
          row.original.lastRunStatus ? (
            <StatusIcon status={row.original.lastRunStatus} error={row.original.lastRunError} />
          ) : (
            <span className='text-muted-foreground text-sm'>—</span>
          ),
      },
      {
        id: 'createdBy',
        accessorFn: row => row.createdByUser?.fullName ?? row.createdByUser?.email,
        size: 190,
        meta: { title: 'Created By' },
        header: ({ column }) => <SortableHeader column={column}>Created By</SortableHeader>,
        cell: ({ row }) => {
          const user = row.original.createdByUser;
          if (!user) return <span className='text-muted-foreground'>-</span>;
          return <UserReference userProjection={user} />;
        },
      },
      {
        id: 'owners',
        accessorFn: row =>
          (row.ownerUsers ?? []).map(user => user.fullName ?? user.email).join(', '),
        size: 190,
        meta: { title: 'Owners' },
        header: ({ column }) => <SortableHeader column={column}>Owners</SortableHeader>,
        cell: ({ row }) => {
          const users = row.original.ownerUsers ?? [];
          if (users.length === 0) {
            return <span className='text-muted-foreground text-sm'>Not assigned</span>;
          }
          if (users.length === 1) return <UserReference userProjection={users[0]} />;
          return <UserAvatarGroup users={users} />;
        },
      },
      {
        id: 'actions',
        size: 130,
        enableResizing: false,
        enableSorting: false,
        header: ({ table }) => <ToggleColumnsHeader table={table} />,
        cell: ({ row }) => (
          <ProjectReportActionsCell
            report={row.original}
            onEditReport={handleEditReport}
            onReportActionComplete={handleReportActionComplete}
          />
        ),
      },
    ],
    [handleEditReport, handleReportActionComplete, scope]
  );

  const { table } = useBaseTable<DataMartReport>({
    data: searchedReports,
    columns,
    storageKeyPrefix: 'project-data-mart-reports',
    defaultSortingColumn: 'lastRunDate',
    defaultPageSize: PROJECT_REPORTS_TABLE_PAGE_SIZE,
    enableRowSelection: false,
  });

  const visibleRunningReportIds = table
    .getRowModel()
    .rows.filter(row => row.original.lastRunStatus === ReportStatusEnum.RUNNING)
    .map(row => row.original.id);
  const visibleRunningReportIdsKey = visibleRunningReportIds.join('\0');

  useEffect(() => {
    if (!visibleRunningReportIdsKey) return;

    const reportIds = visibleRunningReportIdsKey.split('\0');

    const intervalId = window.setInterval(() => {
      void refreshReportsByIds(reportIds);
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshReportsByIds, visibleRunningReportIdsKey]);

  return (
    <ReportsProvider>
      <div className='dm-page' data-testid='dataMartReportsPage'>
        <header className='dm-page-header'>
          <h1 className='dm-page-header-title'>Reports</h1>
        </header>

        <div className='dm-page-content'>
          {isLoading ? (
            <SkeletonList />
          ) : error ? (
            <div className='dm-card-block text-destructive text-sm'>{error}</div>
          ) : reports.length === 0 ? (
            <div className='dm-card'>
              <ProjectDataMartEmptyState variant='reports' />
            </div>
          ) : (
            <div className='dm-card' data-testid='projectReportsTable'>
              <BaseTable
                tableId={PROJECT_REPORTS_TABLE_ID}
                table={table}
                ariaLabel='Project Data Mart Reports'
                paginationProps={{ displaySelected: false }}
                renderToolbarLeft={() => (
                  <>
                    <ProjectDataMartTableFilters
                      appliedState={appliedState}
                      config={filtersConfig}
                      onApply={apply}
                      onClear={clear}
                    />
                    <ProjectDataMartTableSearch value={searchQuery} onChange={setSearchQuery} />
                  </>
                )}
                renderEmptyState={() => (
                  <div
                    className='flex h-32 items-center justify-center text-center'
                    role='status'
                    aria-live='polite'
                  >
                    No reports found for accessible Data Marts
                  </div>
                )}
                onRowClick={row => {
                  if (row.original.canEditConfig) {
                    handleEditReport(row.original);
                  }
                }}
              />
            </div>
          )}
        </div>

        {editingReport && reportDataMartContextValue && (
          <DataMartContext.Provider value={reportDataMartContextValue}>
            <ReportEditSheetRenderer
              destination={editingReport.dataDestination}
              isOpen={isReportEditSheetOpen}
              onClose={handleCloseReportEditSheet}
              onSubmitSuccess={handleReportActionComplete}
              mode={reportEditMode}
              initialReport={editingReport}
            />
          </DataMartContext.Provider>
        )}
      </div>
    </ReportsProvider>
  );
}
