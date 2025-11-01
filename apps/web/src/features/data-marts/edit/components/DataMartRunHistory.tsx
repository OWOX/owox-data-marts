import { useOutletContext } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../../../shared/components/Button';
import { SkeletonList } from '@owox/ui/components/common/skeleton-list';
import { RunItem } from './DataMartRunHistoryView/RunItem';
import { LogViewType } from './DataMartRunHistoryView/types';
import type { DataMartContextType } from '../model/context/types';

export function DataMartRunHistory() {
  const LIMIT = 20;

  const {
    dataMart,
    getDataMartRuns,
    loadMoreDataMartRuns,
    cancelDataMartRun,
    runs = [],
    isLoading,
  } = useOutletContext<DataMartContextType>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [logViewType, setLogViewType] = useState<LogViewType>(LogViewType.STRUCTURED);
  const [searchTerm, setSearchTerm] = useState('');

  const loadRunHistory = useCallback(async () => {
    if (!dataMart?.id) return;
    const data = await getDataMartRuns(dataMart.id, LIMIT, 0);
    setOffset(data.length);
    setHasMore(data.length === LIMIT);
  }, [dataMart?.id, getDataMartRuns, LIMIT]);

  const loadMoreRuns = useCallback(async () => {
    if (!dataMart?.id || loadingMore) return;
    setLoadingMore(true);
    const data = await loadMoreDataMartRuns(dataMart.id, offset, LIMIT);
    setOffset(prev => prev + data.length);
    setHasMore(data.length === LIMIT);
    setLoadingMore(false);
  }, [dataMart?.id, loadMoreDataMartRuns, offset, loadingMore, LIMIT]);

  useEffect(() => {
    if (dataMart?.id) {
      void loadRunHistory();
    }
  }, [dataMart?.id, loadRunHistory]);

  const toggleRunDetails = (runId: string) => {
    setExpandedRun(expandedRun === runId ? null : runId);
  };

  if (isLoading) {
    return <SkeletonList />;
  }

  return (
    <div className='flex flex-col gap-4 pb-4'>
      {runs.length === 0 ? (
        <div className='text-muted-foreground py-8 text-center'>
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
              connectorInfo={dataMart?.connectorInfo ?? null}
            />
          ))}

          {hasMore && (
            <div className='flex justify-center pt-4'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void loadMoreRuns()}
                disabled={loadingMore}
                className='flex items-center gap-2'
              >
                {loadingMore ? (
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
