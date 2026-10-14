import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { wasErrorToastShown } from '../../../app/api/apiClient';
import { apiErrorMessage } from '../../../app/api/extract-api-error.util';
import { useProjectId } from '../../../shared/hooks';
import { pluginsService } from '../services/plugins.service';
import type { PluginHistoryEvent, PluginHistoryType } from '../types';
import { HISTORY_KEY } from './usePlugins';

const EMPTY: PluginHistoryEvent[] = [];

export function usePluginHistory(type: PluginHistoryType) {
  const projectId = useProjectId();

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: [HISTORY_KEY, projectId, type],
    queryFn: ({ pageParam }) => pluginsService.getHistory(type, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
    enabled: Boolean(projectId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    // The API client already toasts most failures; this covers the ones it stays silent on.
    if (isError && !wasErrorToastShown(error)) {
      toast.error(apiErrorMessage(error, 'Plugin history could not be loaded.'));
    }
  }, [isError, error]);

  const lastPage = data?.pages.at(-1);
  useEffect(() => {
    // The server cuts a page before hiding no-op rows, so a page can hold nothing to show.
    if (lastPage?.items.length === 0 && hasNextPage && !isFetchingNextPage && !isError) {
      void fetchNextPage();
    }
  }, [lastPage, hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const events = useMemo(() => data?.pages.flatMap(page => page.items) ?? EMPTY, [data]);

  return {
    events,
    isLoading,
    isError,
    hasMore: hasNextPage,
    isLoadingMore: isFetchingNextPage,
    loadMore: () => void fetchNextPage(),
    retry: () => void refetch(),
  };
}
