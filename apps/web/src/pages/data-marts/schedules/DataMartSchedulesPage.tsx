import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { RefreshCw } from 'lucide-react';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { SkeletonList } from '@owox/ui/components/common/skeleton-list';
import { extractApiError } from '../../../app/api';
import { ConnectorContextProvider } from '../../../features/connectors/shared/model/context';
import { useConnector } from '../../../features/connectors/shared/model/hooks/useConnector';
import type { ConnectorListItem } from '../../../features/connectors/shared/model/types/connector';
import { DataMartContext } from '../../../features/data-marts/edit/model/context/context';
import { ScheduledTriggerType } from '../../../features/data-marts/scheduled-triggers/enums';
import { ScheduleDisplay } from '../../../features/data-marts/scheduled-triggers/components/ScheduleDisplay/ScheduleDisplay';
import { ScheduledTriggerActionsCell } from '../../../features/data-marts/scheduled-triggers/components/ScheduledTriggerTable/ScheduledTriggerActionsCell';
import { ScheduledTriggerRunTarget } from '../../../features/data-marts/scheduled-triggers/components/ScheduledTriggerTable/ScheduledTriggerRunTarget';
import { ScheduledTriggerMapper } from '../../../features/data-marts/scheduled-triggers/model/mappers';
import type { ProjectScheduledTrigger } from '../../../features/data-marts/scheduled-triggers/model/scheduled-trigger.model';
import type {
  ScheduledConnectorRunConfig,
  ScheduledReportRunConfig,
} from '../../../features/data-marts/scheduled-triggers/model/trigger-config.types';
import { scheduledTriggerService } from '../../../features/data-marts/scheduled-triggers/services';
import {
  ScheduledTriggerColumnKey,
  ScheduledTriggerColumnLabels,
} from '../../../features/data-marts/scheduled-triggers/components/ScheduledTriggerTable/columns';
import { StatusLabel, StatusTypeEnum } from '../../../shared/components/StatusLabel';
import { BaseTable, SortableHeader, ToggleColumnsHeader } from '../../../shared/components/Table';
import {
  applyFiltersToData,
  type FilterAccessors,
  type FilterConfigItem,
} from '../../../shared/components/TableFilters';
import { collectOptionsFromData } from '../../../shared/components/TableFilters/collectOptions.utils';
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
import { ProjectScheduledTriggerEditSheet } from './ProjectScheduledTriggerEditSheet';

const DATA_MART_SCHEDULES_PAGE_SIZE = 100;
const PROJECT_SCHEDULED_TRIGGERS_TABLE_ID = 'project-scheduled-triggers-table';

type ProjectScheduledTriggerFilterKey =
  | 'dataMart'
  | 'triggerType'
  | 'runTarget'
  | 'triggerStatus'
  | 'createdBy';

function buildProjectScheduledTriggerFilterAccessors(
  connectors: ConnectorListItem[]
): FilterAccessors<ProjectScheduledTriggerFilterKey, ProjectScheduledTrigger> {
  return {
    dataMart: row => row.dataMart.title,
    triggerType: row => row.type,
    runTarget: row => getScheduledTriggerRunTargetTitle(row, connectors),
    triggerStatus: row => String(row.isActive),
    createdBy: row => row.createdByUser?.userId,
  };
}

function getScheduledTriggerTypeLabel(value: string) {
  switch (value) {
    case 'REPORT_RUN':
      return 'Report Run';
    case 'CONNECTOR_RUN':
      return 'Connector Run';
    default:
      return value;
  }
}

function getScheduledTriggerRunTargetTitle(
  trigger: ProjectScheduledTrigger,
  connectors: ConnectorListItem[] = []
) {
  if (trigger.type === ScheduledTriggerType.REPORT_RUN) {
    const config = trigger.triggerConfig as ScheduledReportRunConfig | undefined;
    return config?.report?.title ?? config?.reportId ?? 'Report';
  }

  const config = trigger.triggerConfig as ScheduledConnectorRunConfig | undefined;
  const connectorSourceName = config?.connector?.connector.source.name;
  const connector = connectors.find(item => item.name === connectorSourceName);
  return (
    connector?.displayName ??
    config?.connector?.connector.info?.displayName ??
    connectorSourceName ??
    'Connector'
  );
}

function buildProjectScheduledTriggerFilters(
  data: ProjectScheduledTrigger[],
  connectors: ConnectorListItem[]
): FilterConfigItem<ProjectScheduledTriggerFilterKey>[] {
  const filterAccessors = buildProjectScheduledTriggerFilterAccessors(connectors);
  const userLabelMapper = buildProjectTableUserLabelMapper(
    data.map(trigger => trigger.createdByUser)
  );

  return [
    {
      id: 'dataMart',
      label: 'Data Mart',
      dataType: 'string',
      operators: ['contains', 'not_contains', 'eq', 'neq'],
      options: collectOptionsFromData(data, filterAccessors.dataMart),
    },
    {
      id: 'triggerType',
      label: 'Trigger Type',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(data, filterAccessors.triggerType, {
        labelMapper: getScheduledTriggerTypeLabel,
      }),
    },
    {
      id: 'runTarget',
      label: 'Run Target',
      dataType: 'string',
      operators: ['contains', 'not_contains', 'eq', 'neq'],
      options: collectOptionsFromData(data, filterAccessors.runTarget),
    },
    {
      id: 'triggerStatus',
      label: 'Trigger Status',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(data, filterAccessors.triggerStatus, {
        labelMapper: value => (value === 'true' ? 'Enabled' : 'Disabled'),
      }),
    },
    {
      id: 'createdBy',
      label: 'Created By',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(data, filterAccessors.createdBy, {
        labelMapper: userLabelMapper,
      }),
    },
  ];
}

function DataMartSchedulesPageContent() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { scope } = useProjectRoute();
  const { connectors, fetchAvailableConnectors } = useConnector();
  const [triggers, setTriggers] = useState<ProjectScheduledTrigger[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMoreTriggersToLoad, setHasMoreTriggersToLoad] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTrigger, setEditingTrigger] = useState<ProjectScheduledTrigger | null>(null);

  const loadTriggers = useCallback(async (offset = 0) => {
    const isInitialLoad = offset === 0;
    if (isInitialLoad) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const response = await scheduledTriggerService.getProjectScheduledTriggers(
        DATA_MART_SCHEDULES_PAGE_SIZE,
        offset
      );
      const nextTriggers = ScheduledTriggerMapper.mapProjectFromDtoList(response);
      setTriggers(currentTriggers =>
        isInitialLoad ? nextTriggers : [...currentTriggers, ...nextTriggers]
      );
      setHasMoreTriggersToLoad(nextTriggers.length >= DATA_MART_SCHEDULES_PAGE_SIZE);
    } catch (caught) {
      setError(extractApiError(caught).message ?? 'Failed to fetch Data Mart triggers');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadTriggers(0);
  }, [loadTriggers]);

  useEffect(() => {
    void fetchAvailableConnectors();
  }, [fetchAvailableConnectors]);

  const loadMoreTriggers = useCallback(async () => {
    if (isLoadingMore || !hasMoreTriggersToLoad) return;
    await loadTriggers(triggers.length);
  }, [hasMoreTriggersToLoad, isLoadingMore, loadTriggers, triggers.length]);

  const handleCloseTriggerEditSheet = useCallback(() => {
    setEditingTrigger(null);
  }, []);

  const handleTriggerSaved = useCallback(async () => {
    await loadTriggers(0);
  }, [loadTriggers]);

  const handleDeleteTrigger = useCallback(
    async (trigger: ProjectScheduledTrigger) => {
      await scheduledTriggerService.deleteScheduledTrigger(trigger.dataMart.id, trigger.id);
      await loadTriggers(0);
    },
    [loadTriggers]
  );

  const filterAccessors = useMemo(
    () => buildProjectScheduledTriggerFilterAccessors(connectors),
    [connectors]
  );

  const filtersConfig = useMemo(
    () => buildProjectScheduledTriggerFilters(triggers, connectors),
    [connectors, triggers]
  );

  const { appliedState, apply, clear } = usePersistentFilters<ProjectScheduledTriggerFilterKey>({
    projectId,
    tableId: PROJECT_SCHEDULED_TRIGGERS_TABLE_ID,
    urlParam: 'filters',
    config: filtersConfig,
  });

  const shouldLoadAllTriggersForQuery =
    searchQuery.trim().length > 0 || appliedState.filters.length > 0;

  useEffect(() => {
    if (!shouldLoadAllTriggersForQuery || !hasMoreTriggersToLoad || isLoading || isLoadingMore) {
      return;
    }

    void loadTriggers(triggers.length);
  }, [
    hasMoreTriggersToLoad,
    isLoading,
    isLoadingMore,
    loadTriggers,
    shouldLoadAllTriggersForQuery,
    triggers.length,
  ]);

  const filteredTriggers = useMemo(
    () =>
      applyFiltersToData<ProjectScheduledTriggerFilterKey, ProjectScheduledTrigger>(
        triggers,
        appliedState,
        filterAccessors
      ),
    [appliedState, filterAccessors, triggers]
  );

  const searchedTriggers = useMemo(
    () =>
      filteredTriggers.filter(trigger =>
        matchesProjectTableSearch(searchQuery, [
          trigger.dataMart.title,
          getScheduledTriggerTypeLabel(trigger.type),
          getScheduledTriggerRunTargetTitle(trigger, connectors),
          trigger.cronExpression,
          trigger.isActive ? 'Enabled' : 'Disabled',
          trigger.createdByUser?.fullName,
          trigger.createdByUser?.email,
        ])
      ),
    [connectors, filteredTriggers, searchQuery]
  );

  const columns = useMemo<ColumnDef<ProjectScheduledTrigger>[]>(
    () => [
      {
        id: 'dataMart',
        accessorFn: row => row.dataMart.title,
        meta: { title: 'Data Mart' },
        size: 260,
        header: ({ column }) => <SortableHeader column={column}>Data Mart</SortableHeader>,
        cell: ({ row }) => (
          <Link
            to={scope(`/data-marts/${row.original.dataMart.id}/triggers`)}
            onClick={event => {
              event.stopPropagation();
            }}
            className='text-foreground hover:text-primary inline-block max-w-full truncate transition-colors'
          >
            {row.original.dataMart.title}
          </Link>
        ),
      },
      {
        accessorKey: ScheduledTriggerColumnKey.TYPE,
        meta: { title: ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.TYPE] },
        size: 170,
        header: ({ column }) => (
          <SortableHeader column={column}>
            {ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.TYPE]}
          </SortableHeader>
        ),
        cell: ({ row }) => {
          const label =
            row.original.type === ScheduledTriggerType.REPORT_RUN ? 'Report Run' : 'Connector Run';
          return <Badge variant='outline'>{label}</Badge>;
        },
      },
      {
        accessorKey: ScheduledTriggerColumnKey.TRIGGER_CONFIG,
        meta: { title: ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.TRIGGER_CONFIG] },
        size: 220,
        header: ({ column }) => (
          <SortableHeader column={column}>
            {ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.TRIGGER_CONFIG]}
          </SortableHeader>
        ),
        cell: ({ row }) => (
          <DataMartContext.Provider value={buildProjectDataMartContextValue(row.original.dataMart)}>
            <ScheduledTriggerRunTarget trigger={row.original} />
          </DataMartContext.Provider>
        ),
      },
      {
        accessorKey: ScheduledTriggerColumnKey.CRON_EXPRESSION,
        meta: { title: ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.CRON_EXPRESSION] },
        size: 190,
        header: ({ column }) => (
          <SortableHeader column={column}>
            {ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.CRON_EXPRESSION]}
          </SortableHeader>
        ),
        cell: ({ row }) => (
          <ScheduleDisplay
            cronExpression={row.original.cronExpression}
            timeZone={row.original.timeZone}
            isEnabled={row.original.isActive}
          />
        ),
      },
      {
        accessorKey: ScheduledTriggerColumnKey.NEXT_RUN,
        meta: { title: ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.NEXT_RUN] },
        size: 160,
        header: ({ column }) => (
          <SortableHeader column={column}>
            {ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.NEXT_RUN]}
          </SortableHeader>
        ),
        cell: ({ row }) => (
          <div className='text-muted-foreground text-sm'>
            {row.original.nextRun ? <RelativeTime date={row.original.nextRun} /> : 'Not scheduled'}
          </div>
        ),
      },
      {
        accessorKey: ScheduledTriggerColumnKey.LAST_RUN,
        meta: { title: ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.LAST_RUN] },
        size: 150,
        header: ({ column }) => (
          <SortableHeader column={column}>
            {ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.LAST_RUN]}
          </SortableHeader>
        ),
        cell: ({ row }) => (
          <div className='text-sm'>
            {row.original.lastRun ? (
              <RelativeTime date={row.original.lastRun} />
            ) : (
              <span className='text-muted-foreground text-sm'>Never run</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: ScheduledTriggerColumnKey.IS_ACTIVE,
        meta: { title: ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.IS_ACTIVE] },
        size: 150,
        header: ({ column }) => (
          <SortableHeader column={column}>
            {ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.IS_ACTIVE]}
          </SortableHeader>
        ),
        cell: ({ row }) => (
          <StatusLabel
            type={row.original.isActive ? StatusTypeEnum.SUCCESS : StatusTypeEnum.NEUTRAL}
            variant='ghost'
            showIcon={false}
          >
            {row.original.isActive ? 'Enabled' : 'Disabled'}
          </StatusLabel>
        ),
      },
      {
        id: ScheduledTriggerColumnKey.CREATED_BY,
        accessorFn: row => row.createdByUser?.fullName ?? row.createdByUser?.email,
        meta: { title: ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.CREATED_BY] },
        size: 180,
        header: ({ column }) => (
          <SortableHeader column={column}>
            {ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.CREATED_BY]}
          </SortableHeader>
        ),
        cell: ({ row }) => {
          const user = row.original.createdByUser;
          if (!user) return <span className='text-muted-foreground'>-</span>;
          return <UserReference userProjection={user} />;
        },
      },
      {
        id: 'actions',
        size: 80,
        enableResizing: false,
        enableSorting: false,
        header: ({ table }) => <ToggleColumnsHeader table={table} />,
        cell: ({ row }) => (
          <ScheduledTriggerActionsCell
            trigger={row.original}
            onEditTrigger={() => {
              setEditingTrigger(row.original);
            }}
            onDeleteTrigger={() => {
              void handleDeleteTrigger(row.original);
            }}
          />
        ),
      },
    ],
    [handleDeleteTrigger, scope]
  );

  const { table } = useBaseTable<ProjectScheduledTrigger>({
    data: searchedTriggers,
    columns,
    storageKeyPrefix: 'project-data-mart-scheduled-triggers',
    defaultSortingColumn: ScheduledTriggerColumnKey.NEXT_RUN,
    defaultPageSize: DATA_MART_SCHEDULES_PAGE_SIZE,
    enableRowSelection: false,
  });

  return (
    <div className='dm-page' data-testid='dataMartSchedulesPage'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Triggers</h1>
      </header>

      <div className='dm-page-content'>
        {isLoading ? (
          <SkeletonList />
        ) : error ? (
          <div className='dm-card-block text-destructive text-sm'>{error}</div>
        ) : triggers.length === 0 ? (
          <div className='dm-card'>
            <ProjectDataMartEmptyState variant='triggers' />
          </div>
        ) : (
          <div className='dm-card' data-testid='projectScheduledTriggersTable'>
            <BaseTable
              tableId={PROJECT_SCHEDULED_TRIGGERS_TABLE_ID}
              table={table}
              ariaLabel='Project Data Mart Triggers'
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
                  No triggers found for accessible Data Marts
                </div>
              )}
              onRowClick={row => {
                setEditingTrigger(row.original);
              }}
            />

            {hasMoreTriggersToLoad && (
              <div className='flex justify-center pt-4 pb-6'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => void loadMoreTriggers()}
                  disabled={isLoadingMore}
                  className='flex items-center gap-2'
                >
                  {isLoadingMore ? (
                    <>
                      <RefreshCw className='h-4 w-4 animate-spin' />
                      Loading...
                    </>
                  ) : (
                    'Load More'
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <ProjectScheduledTriggerEditSheet
        trigger={editingTrigger}
        isOpen={editingTrigger !== null}
        onClose={handleCloseTriggerEditSheet}
        onSaved={handleTriggerSaved}
      />
    </div>
  );
}

export default function DataMartSchedulesPage() {
  return (
    <ConnectorContextProvider>
      <DataMartSchedulesPageContent />
    </ConnectorContextProvider>
  );
}
