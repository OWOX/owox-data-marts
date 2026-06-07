import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import { SkeletonList } from '@owox/ui/components/common/skeleton-list';
import { extractApiError } from '../../../app/api';
import { InsightRowActionsCell } from '../../../features/data-marts/insights/components/InsightRowActionsCell';
import {
  insightTemplatesService,
  mapProjectInsightTemplateListFromDto,
  type ProjectInsightTemplateEntity,
} from '../../../features/data-marts/insights/model';
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
import { ConfirmationDialog } from '../../../shared/components/ConfirmationDialog';
import { ProjectDataMartEmptyState } from '../shared/ProjectDataMartEmptyState';
import { formatDateShort, trackEvent } from '../../../utils';

const PROJECT_INSIGHTS_PAGE_SIZE = 100;
const PROJECT_INSIGHTS_TABLE_ID = 'project-insights-table';

type ProjectInsightFilterKey = 'dataMart' | 'insight' | 'createdBy';

const projectInsightFilterAccessors: FilterAccessors<
  ProjectInsightFilterKey,
  ProjectInsightTemplateEntity
> = {
  dataMart: row => row.dataMart.title,
  insight: row => row.title,
  createdBy: row => row.createdByUser?.userId,
};

function buildProjectInsightFilters(
  data: ProjectInsightTemplateEntity[]
): FilterConfigItem<ProjectInsightFilterKey>[] {
  const userLabelMapper = buildProjectTableUserLabelMapper(
    data.map(insight => insight.createdByUser)
  );

  return [
    {
      id: 'dataMart',
      label: 'Data Mart',
      dataType: 'string',
      operators: ['contains', 'not_contains', 'eq', 'neq'],
      options: collectOptionsFromData(data, projectInsightFilterAccessors.dataMart),
    },
    {
      id: 'insight',
      label: 'Insight',
      dataType: 'string',
      operators: ['contains', 'not_contains', 'eq', 'neq'],
      options: collectOptionsFromData(data, projectInsightFilterAccessors.insight),
    },
    {
      id: 'createdBy',
      label: 'Created By',
      dataType: 'enum',
      operators: ['eq', 'neq'],
      options: collectOptionsFromData(data, projectInsightFilterAccessors.createdBy, {
        labelMapper: userLabelMapper,
      }),
    },
  ];
}

export default function DataMartInsightsPage() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { scope } = useProjectRoute();
  const [insights, setInsights] = useState<ProjectInsightTemplateEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMoreInsightsToLoad, setHasMoreInsightsToLoad] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingInsight, setDeletingInsight] = useState<ProjectInsightTemplateEntity | null>(null);

  const loadInsights = useCallback(async (offset = 0) => {
    const isInitialLoad = offset === 0;
    if (isInitialLoad) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const response = await insightTemplatesService.getProjectInsightTemplates(
        PROJECT_INSIGHTS_PAGE_SIZE,
        offset
      );
      const nextInsights = mapProjectInsightTemplateListFromDto(response);
      setInsights(currentInsights =>
        isInitialLoad ? nextInsights : [...currentInsights, ...nextInsights]
      );
      setHasMoreInsightsToLoad(nextInsights.length >= PROJECT_INSIGHTS_PAGE_SIZE);
    } catch (caught) {
      setError(extractApiError(caught).message ?? 'Failed to fetch Data Mart insights');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadInsights(0);
  }, [loadInsights]);

  const loadMoreInsights = useCallback(async () => {
    if (isLoadingMore || !hasMoreInsightsToLoad) return;
    await loadInsights(insights.length);
  }, [hasMoreInsightsToLoad, insights.length, isLoadingMore, loadInsights]);

  const handleConfirmDelete = useCallback(() => {
    void (async () => {
      if (!deletingInsight) return;

      try {
        await insightTemplatesService.deleteInsightTemplate(
          deletingInsight.dataMart.id,
          deletingInsight.id
        );
        trackEvent({
          event: 'insight_deleted',
          category: 'Insights',
          action: 'Delete',
          label: deletingInsight.id,
          context: deletingInsight.dataMart.id,
        });
        setInsights(currentInsights =>
          currentInsights.filter(insight => insight.id !== deletingInsight.id)
        );
        toast.success('Insight deleted');
      } catch {
        trackEvent({
          event: 'insight_error',
          category: 'Insights',
          action: 'DeleteError',
          label: deletingInsight.id,
          context: deletingInsight.dataMart.id,
        });
        toast.error('Failed to delete insight');
      } finally {
        setDeletingInsight(null);
      }
    })();
  }, [deletingInsight]);

  const filtersConfig = useMemo(() => buildProjectInsightFilters(insights), [insights]);

  const { appliedState, apply, clear } = usePersistentFilters<ProjectInsightFilterKey>({
    projectId,
    tableId: PROJECT_INSIGHTS_TABLE_ID,
    urlParam: 'filters',
    config: filtersConfig,
  });

  const shouldLoadAllInsightsForQuery =
    searchQuery.trim().length > 0 || appliedState.filters.length > 0;

  useEffect(() => {
    if (!shouldLoadAllInsightsForQuery || !hasMoreInsightsToLoad || isLoading || isLoadingMore) {
      return;
    }

    void loadInsights(insights.length);
  }, [
    hasMoreInsightsToLoad,
    insights.length,
    isLoading,
    isLoadingMore,
    loadInsights,
    shouldLoadAllInsightsForQuery,
  ]);

  const filteredInsights = useMemo(
    () =>
      applyFiltersToData<ProjectInsightFilterKey, ProjectInsightTemplateEntity>(
        insights,
        appliedState,
        projectInsightFilterAccessors
      ),
    [appliedState, insights]
  );

  const searchedInsights = useMemo(
    () =>
      filteredInsights.filter(insight =>
        matchesProjectTableSearch(searchQuery, [
          insight.dataMart.title,
          insight.title,
          insight.createdByUser?.fullName,
          insight.createdByUser?.email,
        ])
      ),
    [filteredInsights, searchQuery]
  );

  const columns = useMemo<ColumnDef<ProjectInsightTemplateEntity>[]>(
    () => [
      {
        id: 'dataMart',
        accessorFn: row => row.dataMart.title,
        size: 260,
        meta: { title: 'Data Mart' },
        header: ({ column }) => <SortableHeader column={column}>Data Mart</SortableHeader>,
        cell: ({ row }) => (
          <Link
            to={scope(`/data-marts/${row.original.dataMart.id}/insights-v2`)}
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
        accessorKey: 'title',
        size: 320,
        meta: { title: 'Insight' },
        header: ({ column }) => <SortableHeader column={column}>Insight</SortableHeader>,
        cell: ({ row }) => (
          <Link
            to={scope(`/data-marts/${row.original.dataMart.id}/insights-v2/${row.original.id}`)}
            onClick={event => {
              event.stopPropagation();
            }}
            className='text-foreground hover:text-primary inline-block max-w-full truncate transition-colors'
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'modifiedAt',
        size: 180,
        sortDescFirst: true,
        meta: { title: 'Updated' },
        header: ({ column }) => <SortableHeader column={column}>Updated</SortableHeader>,
        cell: ({ row }) => (
          <div className='text-muted-foreground'>{formatDateShort(row.original.modifiedAt)}</div>
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
        id: 'actions',
        size: 80,
        enableResizing: false,
        enableSorting: false,
        header: ({ table }) => <ToggleColumnsHeader table={table} />,
        cell: ({ row }) =>
          row.original.canDelete ? (
            <InsightRowActionsCell
              id={row.original.id}
              canDelete={row.original.canDelete}
              onDelete={() => {
                setDeletingInsight(row.original);
              }}
            />
          ) : null,
      },
    ],
    [scope]
  );

  const { table } = useBaseTable<ProjectInsightTemplateEntity>({
    data: searchedInsights,
    columns,
    storageKeyPrefix: 'project-data-mart-insights',
    defaultSortingColumn: 'modifiedAt',
    defaultPageSize: PROJECT_INSIGHTS_PAGE_SIZE,
    enableRowSelection: false,
  });

  return (
    <div className='dm-page' data-testid='dataMartInsightsPage'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Insights</h1>
      </header>

      <div className='dm-page-content'>
        {isLoading ? (
          <SkeletonList />
        ) : error ? (
          <div className='dm-card-block text-destructive text-sm'>{error}</div>
        ) : insights.length === 0 ? (
          <div className='dm-card'>
            <ProjectDataMartEmptyState variant='insights' />
          </div>
        ) : (
          <div className='dm-card' data-testid='projectInsightsTable'>
            <BaseTable
              tableId={PROJECT_INSIGHTS_TABLE_ID}
              table={table}
              ariaLabel='Project Data Mart Insights'
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
                  No insights found for accessible Data Marts
                </div>
              )}
            />

            {hasMoreInsightsToLoad && (
              <div className='flex justify-center pt-4 pb-6'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => void loadMoreInsights()}
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

      <ConfirmationDialog
        open={deletingInsight !== null}
        onOpenChange={open => {
          if (!open) {
            setDeletingInsight(null);
          }
        }}
        title='Delete insight'
        description='Are you sure you want to delete this insight? This action cannot be undone.'
        confirmLabel='Delete'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
