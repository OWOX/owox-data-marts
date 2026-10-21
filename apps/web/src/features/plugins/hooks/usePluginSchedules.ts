import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { apiErrorMessage } from '../../../app/api/extract-api-error.util';
import { useProjectId } from '../../../shared/hooks';
import { isOpenRunStatus } from '../scheduleLabels';
import { pluginsService } from '../services/plugins.service';
import type { ProjectPluginSchedule } from '../types';

export const SCHEDULES_KEY = 'plugin-schedules';

const POLL_MS = 15_000;

const EMPTY_SCHEDULES: ProjectPluginSchedule[] = [];

export type ScheduleOperation = 'pause' | 'resume' | 'delete';

/** The schedules the caller can see, or one installation's, and the three changes made to them. */
export function usePluginSchedules(installationId?: string) {
  const queryClient = useQueryClient();
  const projectId = useProjectId();

  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: [SCHEDULES_KEY, projectId, installationId ?? 'all'],
    queryFn: () => pluginsService.listSchedules(installationId),
    enabled: Boolean(projectId),
    retry: false,
    refetchOnWindowFocus: false,
    // A run starts and ends without the member doing anything.
    refetchInterval: ({ state }) =>
      state.data?.some(item => item.lastRun && isOpenRunStatus(item.lastRun.status))
        ? POLL_MS
        : false,
  });

  const { mutateAsync, isPending: isChanging } = useMutation({
    mutationFn: async ({ operation, id }: { operation: ScheduleOperation; id: string }) => {
      if (operation === 'pause') await pluginsService.pauseSchedule(id);
      else if (operation === 'resume') await pluginsService.resumeSchedule(id);
      else await pluginsService.deleteSchedule(id);
    },
    // Also after a refusal, and for every list of the project, which all show the same schedule.
    onSettled: () => queryClient.invalidateQueries({ queryKey: [SCHEDULES_KEY, projectId] }),
  });

  /** True when the change went through; a refusal is toasted with the API's own message. */
  const change = useCallback(
    async (operation: ScheduleOperation, id: string): Promise<boolean> => {
      try {
        await mutateAsync({ operation, id });
        return true;
      } catch (caught) {
        toast.error(apiErrorMessage(caught, 'Something went wrong. Please try again.'));
        return false;
      }
    },
    [mutateAsync]
  );

  return {
    schedules: data ?? EMPTY_SCHEDULES,
    // False while the list cannot be read yet, such as without a project.
    enabled: Boolean(projectId),
    hasData: data !== undefined,
    // Pending, not loading: a query that cannot run yet has no list, so it is not an empty one.
    isPending,
    // A cached list can be older than a link to a schedule created since.
    isFetching,
    isError,
    refetch,
    isChanging,
    change,
  };
}
