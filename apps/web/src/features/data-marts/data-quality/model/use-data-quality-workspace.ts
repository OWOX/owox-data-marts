import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { dataQualityService } from '../api/data-quality.service';
import { dataQualityPollingInterval } from './data-quality.model';
import type { DataQualityConfig, DataQualityRun } from './types';

const ROOT_QUERY_KEY = 'data-quality';
const SILENT_QUERY_OPTIONS = {
  skipLoadingIndicator: true,
  skipErrorToast: true,
} as const;

export const dataQualityQueryKeys = {
  root: (projectId: string, dataMartId: string) => [ROOT_QUERY_KEY, projectId, dataMartId] as const,
  config: (projectId: string, dataMartId: string) =>
    [...dataQualityQueryKeys.root(projectId, dataMartId), 'config'] as const,
  latest: (projectId: string, dataMartId: string) =>
    [...dataQualityQueryKeys.root(projectId, dataMartId), 'latest'] as const,
  summary: (projectId: string, dataMartId: string) =>
    [...dataQualityQueryKeys.root(projectId, dataMartId), 'summary'] as const,
  summariesRoot: (projectId: string) => [ROOT_QUERY_KEY, projectId, 'summaries'] as const,
  summaries: (projectId: string, dataMartIds: readonly string[]) =>
    [...dataQualityQueryKeys.summariesRoot(projectId), dataMartIds] as const,
  run: (projectId: string, dataMartId: string, runId: string) =>
    [...dataQualityQueryKeys.root(projectId, dataMartId), 'run', runId] as const,
};

export function useDataQualitySummaries(projectId: string, dataMartIds: readonly string[]) {
  const normalizedDataMartIds = Array.from(new Set(dataMartIds)).sort();

  return useQuery({
    queryKey: dataQualityQueryKeys.summaries(projectId, normalizedDataMartIds),
    queryFn: ({ signal }) =>
      dataQualityService.getSummaries(normalizedDataMartIds, {
        signal,
        ...SILENT_QUERY_OPTIONS,
      }),
    enabled: Boolean(projectId && normalizedDataMartIds.length > 0),
    refetchInterval: query =>
      Object.values(query.state.data ?? {}).some(
        summary => dataQualityPollingInterval(summary?.state) !== false
      )
        ? 2_000
        : false,
  });
}

export function useDataQualitySummary(projectId: string, dataMartId: string) {
  return useQuery({
    queryKey: dataQualityQueryKeys.summary(projectId, dataMartId),
    queryFn: async ({ signal }) => {
      const summaries = await dataQualityService.getSummaries([dataMartId], {
        signal,
        ...SILENT_QUERY_OPTIONS,
      });
      const summary = summaries[dataMartId];
      if (!summary) {
        throw new Error(`Data Quality summary was not returned for Data Mart ${dataMartId}`);
      }
      return summary;
    },
    enabled: Boolean(projectId && dataMartId),
    refetchInterval: query => dataQualityPollingInterval(query.state.data?.state),
  });
}

export function useDataQualityConfig(projectId: string, dataMartId: string) {
  return useQuery({
    queryKey: dataQualityQueryKeys.config(projectId, dataMartId),
    queryFn: ({ signal }) =>
      dataQualityService.getConfig(dataMartId, { signal, ...SILENT_QUERY_OPTIONS }),
    enabled: Boolean(projectId && dataMartId),
  });
}

export function useLatestDataQualityRun(projectId: string, dataMartId: string) {
  return useQuery({
    queryKey: dataQualityQueryKeys.latest(projectId, dataMartId),
    queryFn: ({ signal }) =>
      dataQualityService.getLatestRun(dataMartId, { signal, ...SILENT_QUERY_OPTIONS }),
    enabled: Boolean(projectId && dataMartId),
    refetchInterval: query => dataQualityPollingInterval(query.state.data?.summary.state),
  });
}

export function useDataQualityRun(projectId: string, dataMartId: string, runId: string | null) {
  return useQuery({
    queryKey: dataQualityQueryKeys.run(projectId, dataMartId, runId ?? ''),
    queryFn: ({ signal }) =>
      dataQualityService.getRun(dataMartId, runId ?? '', { signal, ...SILENT_QUERY_OPTIONS }),
    enabled: Boolean(projectId && dataMartId && runId),
    refetchInterval: query => dataQualityPollingInterval(query.state.data?.summary.state),
  });
}

export function useDataQualityWorkspace(projectId: string, dataMartId: string) {
  const queryClient = useQueryClient();
  const configQuery = useDataQualityConfig(projectId, dataMartId);
  const latestQuery = useLatestDataQualityRun(projectId, dataMartId);
  const latestState = latestQuery.data?.summary.state;
  const latestIsActive = latestState === 'QUEUED' || latestState === 'RUNNING';
  const previousLatestRef = useRef({ projectId, dataMartId, state: latestState });
  const terminalRunRef = useRef<{
    projectId: string;
    dataMartId: string;
    runId: string | null;
    run: DataQualityRun | null;
  }>({ projectId, dataMartId, runId: null, run: null });
  if (
    terminalRunRef.current.projectId !== projectId ||
    terminalRunRef.current.dataMartId !== dataMartId
  ) {
    terminalRunRef.current = { projectId, dataMartId, runId: null, run: null };
  }
  if (latestQuery.data && !latestIsActive) {
    terminalRunRef.current.runId = latestQuery.data.runId;
  }
  const detailRunId = terminalRunRef.current.runId;
  const runQuery = useDataQualityRun(projectId, dataMartId, detailRunId);
  if (runQuery.data && !isActiveState(runQuery.data.summary.state)) {
    terminalRunRef.current.runId = runQuery.data.runId;
    terminalRunRef.current.run = runQuery.data;
  }
  const activeRun = latestIsActive ? (latestQuery.data ?? null) : null;
  const latestRun = latestIsActive
    ? terminalRunRef.current.run
    : (runQuery.data ?? terminalRunRef.current.run);

  useEffect(() => {
    const previous = previousLatestRef.current;
    previousLatestRef.current = { projectId, dataMartId, state: latestState };
    const isSameWorkspace = previous.projectId === projectId && previous.dataMartId === dataMartId;
    const wasActive = previous.state === 'QUEUED' || previous.state === 'RUNNING';
    const isActive = latestState === 'QUEUED' || latestState === 'RUNNING';

    if (!isSameWorkspace || !wasActive || !latestState || isActive) return;

    void queryClient.invalidateQueries({
      queryKey: dataQualityQueryKeys.config(projectId, dataMartId),
    });
  }, [dataMartId, latestState, projectId, queryClient]);

  const saveMutation = useMutation({
    mutationFn: (config: DataQualityConfig) => dataQualityService.replaceConfig(dataMartId, config),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: dataQualityQueryKeys.config(projectId, dataMartId),
      });
    },
    onSuccess: response => {
      queryClient.setQueryData(dataQualityQueryKeys.config(projectId, dataMartId), response);
      void queryClient.invalidateQueries({
        queryKey: dataQualityQueryKeys.config(projectId, dataMartId),
      });
    },
  });

  const runMutation = useMutation({
    mutationFn: (configRevision?: string) =>
      configRevision
        ? dataQualityService.startRun(dataMartId, { configRevision })
        : dataQualityService.startRun(dataMartId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: dataQualityQueryKeys.latest(projectId, dataMartId),
      });
      void queryClient.invalidateQueries({
        queryKey: dataQualityQueryKeys.summary(projectId, dataMartId),
      });
      void queryClient.invalidateQueries({
        queryKey: dataQualityQueryKeys.config(projectId, dataMartId),
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => {
      const runId = activeRun?.runId;
      if (!runId) throw new Error('There is no active Data Quality run to cancel');
      return dataQualityService.cancelRun(dataMartId, runId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: dataQualityQueryKeys.latest(projectId, dataMartId),
      });
      void queryClient.invalidateQueries({
        queryKey: dataQualityQueryKeys.summary(projectId, dataMartId),
      });
    },
  });

  return {
    configResponse: configQuery.data,
    activeRun,
    latestRunOverview: latestQuery.data ?? null,
    latestRun,
    isLoading: configQuery.isLoading || latestQuery.isLoading,
    isError: configQuery.isError || latestQuery.isError,
    error: configQuery.error ?? latestQuery.error,
    isResultsLoading: runQuery.isLoading,
    resultsError: runQuery.error,
    isSaving: saveMutation.isPending,
    isStarting: runMutation.isPending,
    isCancelling: cancelMutation.isPending,
    saveConfig: saveMutation.mutateAsync,
    startRun: (configRevision?: string) => runMutation.mutateAsync(configRevision),
    cancelRun: () => cancelMutation.mutateAsync(),
  };
}

function isActiveState(state: DataQualityRun['summary']['state']): boolean {
  return state === 'QUEUED' || state === 'RUNNING';
}
