import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { SkeletonList } from '@owox/ui/components/common/skeleton-list';
import { extractApiError } from '../../../app/api';
import { DataMartRunType, dataMartService } from '../../../features/data-marts/shared';
import { isDataMartRunFinalStatus } from '../../../features/data-marts/shared/utils/status.utils';
import {
  RefreshRunsButton,
  RunItem,
} from '../../../features/data-marts/edit/components/DataMartRunHistoryView';
import { LogViewType } from '../../../features/data-marts/edit/components/DataMartRunHistoryView/types';
import { mapProjectDataMartRunListResponseDtoToEntity } from '../../../features/data-marts/edit/model/mappers';
import type { ProjectDataMartRunItem } from '../../../features/data-marts/edit/model/types';
import type { ConnectorListItem } from '../../../features/connectors/shared/model/types/connector';
import { getConnectorInfoByName } from '../../../features/connectors/shared/utils';
import { useProjectRoute } from '../../../shared/hooks';
import { ProjectDataMartEmptyState } from '../shared/ProjectDataMartEmptyState';
import { ProjectDataMartSectionHeader } from '../shared/ProjectDataMartSectionHeader';

const PROJECT_RUNS_PAGE_SIZE = 50;

// A silent load keeps the list on a failure; `reportErrors` still toasts and rethrows.
interface LoadRunsOptions {
  silent?: boolean;
  reportErrors?: boolean;
}

export default function DataMartRunsPage() {
  const { scope } = useProjectRoute();
  // One state, so a load decides the list and the Load More flag together.
  const [{ runs, hasMoreRunsToLoad }, setRunList] = useState<{
    runs: ProjectDataMartRunItem[];
    hasMoreRunsToLoad: boolean;
  }>({ runs: [], hasMoreRunsToLoad: false });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [logViewType, setLogViewType] = useState<LogViewType>(LogViewType.STRUCTURED);
  const [searchTerm, setSearchTerm] = useState('');
  const [connectorInfoByName, setConnectorInfoByName] = useState<
    Record<string, ConnectorListItem | null>
  >({});

  const loadRuns = useCallback(async (offset = 0, options?: LoadRunsOptions) => {
    const isInitialLoad = offset === 0;
    const isSilent = options?.silent === true;
    const reportErrors = options?.reportErrors === true;

    if (isInitialLoad) {
      if (!isSilent) {
        setIsLoading(true);
      }
    } else {
      setIsLoadingMore(true);
    }
    if (!isSilent) {
      setError(null);
    }

    try {
      const response = await dataMartService.getProjectDataMartRuns(
        PROJECT_RUNS_PAGE_SIZE,
        offset,
        isSilent ? { skipLoadingIndicator: true, skipErrorToast: !reportErrors } : undefined
      );
      const nextRuns = mapProjectDataMartRunListResponseDtoToEntity(response);
      const isFullPage = nextRuns.length >= PROJECT_RUNS_PAGE_SIZE;
      setRunList(current => {
        if (!isInitialLoad) {
          const loadedRunIds = new Set(current.runs.map(run => run.id));
          return {
            runs: [...current.runs, ...nextRuns.filter(run => !loadedRunIds.has(run.id))],
            hasMoreRunsToLoad: isFullPage,
          };
        }

        const nextRunIds = new Set(nextRuns.map(run => run.id));
        const loadedOtherRuns = current.runs.filter(run => !nextRunIds.has(run.id));
        // No loaded run in the page: more new runs started than one page holds, so a merge
        // would hide the runs between them. Start the list again instead.
        if (!isSilent || loadedOtherRuns.length === current.runs.length) {
          return { runs: nextRuns, hasMoreRunsToLoad: isFullPage };
        }

        return {
          runs: [...nextRuns, ...loadedOtherRuns],
          hasMoreRunsToLoad: current.hasMoreRunsToLoad,
        };
      });
    } catch (caught) {
      if (!isSilent) {
        setError(extractApiError(caught).message ?? 'Failed to fetch Data Mart runs');
      } else if (reportErrors) {
        throw caught;
      }
    } finally {
      if (isInitialLoad) {
        if (!isSilent) {
          setIsLoading(false);
        }
      } else {
        setIsLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadRuns(0);
  }, [loadRuns]);

  const hasActiveRuns = useMemo(
    () => runs.some(run => !isDataMartRunFinalStatus(run.status)),
    [runs]
  );

  useEffect(() => {
    if (!hasActiveRuns || isLoadingMore) return;

    const intervalId = window.setInterval(() => {
      void loadRuns(0, { silent: true });
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasActiveRuns, isLoadingMore, loadRuns]);

  const connectorSourceNames = useMemo(() => {
    const names = runs.map(getConnectorSourceName).filter((name): name is string => Boolean(name));
    return Array.from(new Set(names)).sort();
  }, [runs]);

  useEffect(() => {
    const missingConnectorNames = connectorSourceNames.filter(
      name => !(name in connectorInfoByName)
    );
    if (missingConnectorNames.length === 0) return;

    void (async () => {
      const entries: [string, ConnectorListItem | null][] = [];

      for (const name of missingConnectorNames) {
        try {
          entries.push([name, await getConnectorInfoByName(name)]);
        } catch {
          entries.push([name, null]);
        }
      }

      setConnectorInfoByName(current => ({
        ...current,
        ...Object.fromEntries(entries),
      }));
    })();
  }, [connectorInfoByName, connectorSourceNames]);

  const loadMoreRuns = useCallback(async () => {
    if (isLoadingMore || !hasMoreRunsToLoad) return;
    await loadRuns(runs.length);
  }, [hasMoreRunsToLoad, isLoadingMore, loadRuns, runs.length]);

  const cancelDataMartRun = useCallback(
    async (dataMartId: string, runId: string) => {
      try {
        await dataMartService.cancelDataMartRun(dataMartId, runId);
        await loadRuns(0);
      } catch (caught) {
        throw new Error(extractApiError(caught).message ?? 'Failed to cancel Data Mart run');
      }
    },
    [loadRuns]
  );

  const toggleRunDetails = (runId: string) => {
    setExpandedRun(current => (current === runId ? null : runId));
  };

  return (
    <div className='dm-page' data-testid='dataMartRunsPage'>
      <ProjectDataMartSectionHeader
        title='Run History'
        actions={
          // A silent load keeps the loaded pages but never clears a load error, so retry loudly then.
          <RefreshRunsButton
            onRefresh={() => loadRuns(0, { silent: error === null, reportErrors: true })}
          />
        }
      />

      <div className='dm-page-content'>
        {isLoading ? (
          <div className='dm-card'>
            <SkeletonList />
          </div>
        ) : error ? (
          <div className='dm-card-block text-destructive text-sm'>{error}</div>
        ) : runs.length === 0 ? (
          <div className='dm-card'>
            <ProjectDataMartEmptyState variant='runs' />
          </div>
        ) : (
          <div className='dm-card space-y-2' data-testid='projectRunHistoryList'>
            {runs.map(run => (
              <RunItem
                key={run.id}
                run={run}
                isExpanded={expandedRun === run.id}
                onToggle={toggleRunDetails}
                logViewType={logViewType}
                setLogViewType={setLogViewType}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                cancelDataMartRun={cancelDataMartRun}
                dataMartId={run.dataMart.id}
                dataMartConnectorInfo={getConnectorInfoForRun(run, connectorInfoByName)}
                dataMartRef={{
                  id: run.dataMart.id,
                  title: run.dataMart.title,
                  href: scope(`/data-marts/${run.dataMart.id}/run-history`),
                }}
              />
            ))}

            {hasMoreRunsToLoad && (
              <div className='flex justify-center pt-4 pb-6'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => void loadMoreRuns()}
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
    </div>
  );
}

function getConnectorSourceName(run: ProjectDataMartRunItem): string | null {
  const definitionRun = run.definitionRun as ProjectDataMartRunItem['definitionRun'] | null;

  if (run.type !== DataMartRunType.CONNECTOR || !definitionRun || !('connector' in definitionRun)) {
    return null;
  }

  return definitionRun.connector.source.name;
}

function getConnectorInfoForRun(
  run: ProjectDataMartRunItem,
  connectorInfoByName: Record<string, ConnectorListItem | null>
): ConnectorListItem | null {
  const connectorSourceName = getConnectorSourceName(run);
  if (!connectorSourceName) return null;

  return connectorInfoByName[connectorSourceName] ?? null;
}
