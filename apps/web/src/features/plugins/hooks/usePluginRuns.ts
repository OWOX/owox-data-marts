import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { apiErrorMessage } from '../../../app/api/extract-api-error.util';
import { useProjectId } from '../../../shared/hooks';
import { isOpenRunStatus } from '../scheduleLabels';
import { pluginsService } from '../services/plugins.service';
import type { PluginRun, PluginRunFilters } from '../types';
import { SCHEDULES_KEY } from './usePluginSchedules';

export const RUNS_KEY = 'plugin-runs';

const POLL_MS = 5_000;

const EMPTY: PluginRun[] = [];

const isOpen = (run: PluginRun) => isOpenRunStatus(run.status);

const isNotFound = (error: unknown) =>
  (error as { response?: { status?: number } } | null)?.response?.status === 404;

/** Run History, newest first; the loaded pages refetch every 5 s while one of their runs is open. */
export function usePluginRuns(filters: PluginRunFilters) {
  const projectId = useProjectId();

  const { data, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } =
    useInfiniteQuery({
      queryKey: [RUNS_KEY, projectId, 'list', filters],
      queryFn: ({ pageParam }) => pluginsService.listRuns(filters, pageParam),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: last => last.nextCursor ?? undefined,
      enabled: Boolean(projectId),
      retry: false,
      refetchOnWindowFocus: false,
      // A poll that returns the same data still re-renders, so running durations move.
      notifyOnChangeProps: 'all',
      refetchInterval: ({ state }) =>
        state.data?.pages.some(page => page.items.some(isOpen)) ? POLL_MS : false,
    });

  const runs = useMemo(() => data?.pages.flatMap(page => page.items) ?? EMPTY, [data]);

  const loadMore = useCallback(() => {
    // The list query skips the global toast, so a failed next page is told here.
    void fetchNextPage().then(result => {
      if (result.isError) toast.error('More runs could not be loaded.');
    });
  }, [fetchNextPage]);
  const retry = useCallback(() => void refetch(), [refetch]);

  return {
    runs,
    isPending,
    isError,
    hasMore: hasNextPage,
    isLoadingMore: isFetchingNextPage,
    loadMore,
    retry,
  };
}

/** A run named by a link; undefined until it loads, and null for good when the API cannot find it. */
export function usePluginRun(id: string | null): PluginRun | null | undefined {
  const projectId = useProjectId();

  const { data, error } = useQuery({
    queryKey: [RUNS_KEY, projectId, 'run', id],
    queryFn: () => (id === null ? null : pluginsService.getRun(id)),
    enabled: Boolean(projectId) && id !== null,
    retry: false,
    refetchOnWindowFocus: false,
    notifyOnChangeProps: 'all',
    // The last data is kept after an error, so a run that vanished would poll for good.
    refetchInterval: ({ state }) =>
      state.data && isOpen(state.data) && !isNotFound(state.error) ? POLL_MS : false,
  });

  return isNotFound(error) ? null : (data ?? undefined);
}

export function useCancelPluginRun() {
  const queryClient = useQueryClient();
  const projectId = useProjectId();

  const mutation = useMutation({
    mutationFn: (id: string) => pluginsService.cancelRun(id),
    // A cancelled scheduled run is also its schedule's last run.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [RUNS_KEY, projectId] }),
        queryClient.invalidateQueries({ queryKey: [SCHEDULES_KEY, projectId] }),
      ]),
  });

  /** True when the cancel went through; a refusal is toasted with the API's own message. */
  const { mutateAsync } = mutation;
  const cancel = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await mutateAsync(id);
        return true;
      } catch (caught) {
        toast.error(apiErrorMessage(caught, 'Something went wrong. Please try again.'));
        return false;
      }
    },
    [mutateAsync]
  );

  return { cancel, isCancelling: mutation.isPending };
}
