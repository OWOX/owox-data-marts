import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { apiErrorMessage } from '../../../app/api/extract-api-error.util';
import { useProjectId } from '../../../shared/hooks';
import { pluginsService } from '../services/plugins.service';
import type { PluginHistoryEvent, PluginHistoryType } from '../types';
import { HISTORY_KEY } from './usePlugins';

const EMPTY: PluginHistoryEvent[] = [];

export function usePluginHistory(type: PluginHistoryType) {
  const projectId = useProjectId();

  const { data, isLoading, isError, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: [HISTORY_KEY, projectId, type],
      queryFn: ({ pageParam }) => pluginsService.getHistory(type, pageParam),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: last => last.nextCursor ?? undefined,
      enabled: Boolean(projectId),
      retry: false,
      refetchOnWindowFocus: false,
    });

  useEffect(() => {
    if (isError) {
      toast.error(apiErrorMessage(error, 'Plugin history could not be loaded.'));
    }
  }, [isError, error]);

  const events = useMemo(() => data?.pages.flatMap(page => page.items) ?? EMPTY, [data]);

  return {
    events,
    isLoading,
    hasMore: hasNextPage,
    isLoadingMore: isFetchingNextPage,
    loadMore: () => void fetchNextPage(),
  };
}
