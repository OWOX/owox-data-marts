import { useOutletContext } from 'react-router-dom';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../../../shared/components/Button';
import { SkeletonList } from '@owox/ui/components/common/skeleton-list';
import { RunItem } from './DataMartRunHistoryView/RunItem';
import { LogViewType } from './DataMartRunHistoryView/types';
import type { DataMartContextType } from '../model/context/types';
import { DataMartDefinitionType } from '../../shared';
import type { ConnectorListItem } from '../../../connectors/shared/model/types/connector';
import { DATA_MART_RUNS_PAGE_SIZE } from '../constants';

export function DataMartRunHistory() {
  const {
    dataMart,
    getDataMartRuns,
    loadMoreDataMartRuns,
    cancelDataMartRun,
    runs,
    isLoading,
    isLoadingMoreRuns,
    hasMoreRunsToLoad,
  } = useOutletContext<DataMartContextType>();
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [logViewType, setLogViewType] = useState<LogViewType>(LogViewType.STRUCTURED);
  const [searchTerm, setSearchTerm] = useState('');

  const loadMoreRuns = useCallback(async () => {
    if (!dataMart?.id || isLoadingMoreRuns || !hasMoreRunsToLoad) return;
    // Calculate offset dynamically based on current runs count
    const currentOffset = runs.length;
    await loadMoreDataMartRuns(dataMart.id, currentOffset, DATA_MART_RUNS_PAGE_SIZE);
  }, [dataMart?.id, loadMoreDataMartRuns, runs.length, isLoadingMoreRuns, hasMoreRunsToLoad]);

  // Load runs when component mounts
  useEffect(() => {
    if (dataMart?.id) {
      void getDataMartRuns(dataMart.id, DATA_MART_RUNS_PAGE_SIZE, 0);
    }
  }, [dataMart?.id, getDataMartRuns]);

  const dataMartConnectorInfo = useMemo<ConnectorListItem | null>(() => {
    if (
      dataMart?.definitionType === DataMartDefinitionType.CONNECTOR &&
      dataMart.definition &&
      'connector' in dataMart.definition
    ) {
      return dataMart.definition.connector.info ?? null;
    }
    return null;
  }, [dataMart]);

  const toggleRunDetails = (runId: string) => {
    setExpandedRun(expandedRun === runId ? null : runId);
  };

  if (isLoading) {
    return <SkeletonList />;
  }

  return (
    <div className='flex flex-col gap-4 pb-4'>
      {runs.length === 0 ? (
        <div className='text-muted-foreground rounded-sm border-b border-gray-200 bg-white p-8 text-center text-sm dark:border-white/4 dark:bg-white/1'>
          No runs found for this Data Mart
        </div>
      ) : (
        <div className='space-y-2'>
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
              dataMartId={dataMart?.id}
              dataMartConnectorInfo={dataMartConnectorInfo}
            />
          ))}

          {hasMoreRunsToLoad && (
            <div className='flex justify-center pt-4'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void loadMoreRuns()}
                disabled={isLoadingMoreRuns}
                className='flex items-center gap-2'
              >
                {isLoadingMoreRuns ? (
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
  );
}
