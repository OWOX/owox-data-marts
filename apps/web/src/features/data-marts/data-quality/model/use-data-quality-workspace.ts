import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dataQualityService } from '../api/data-quality.service';
import { dataQualityPollingInterval } from './data-quality.model';
import type { DataQualityConfig } from './types';

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
  run: (projectId: string, dataMartId: string, runId: string) =>
    [...dataQualityQueryKeys.root(projectId, dataMartId), 'run', runId] as const,
};

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
  const detailRunId =
    latestQuery.data && latestState !== 'QUEUED' && latestState !== 'RUNNING'
      ? latestQuery.data.id
      : null;
  const runQuery = useDataQualityRun(projectId, dataMartId, detailRunId);

  const saveMutation = useMutation({
    mutationFn: (config: DataQualityConfig) => dataQualityService.replaceConfig(dataMartId, config),
    onSuccess: response => {
      queryClient.setQueryData(dataQualityQueryKeys.config(projectId, dataMartId), response);
      void queryClient.invalidateQueries({
        queryKey: dataQualityQueryKeys.config(projectId, dataMartId),
      });
    },
  });

  const runMutation = useMutation({
    mutationFn: (config?: DataQualityConfig) => dataQualityService.startRun(dataMartId, config),
    onSuccess: run => {
      queryClient.setQueryData(dataQualityQueryKeys.latest(projectId, dataMartId), run);
      void queryClient.invalidateQueries({
        queryKey: dataQualityQueryKeys.latest(projectId, dataMartId),
      });
      void queryClient.invalidateQueries({
        queryKey: dataQualityQueryKeys.config(projectId, dataMartId),
      });
    },
  });

  return {
    configResponse: configQuery.data,
    latestRun: runQuery.data ?? latestQuery.data ?? null,
    isLoading: configQuery.isLoading || latestQuery.isLoading,
    isError: configQuery.isError || latestQuery.isError,
    error: configQuery.error ?? latestQuery.error,
    isResultsLoading: runQuery.isLoading,
    resultsError: runQuery.error,
    isSaving: saveMutation.isPending,
    isStarting: runMutation.isPending,
    saveConfig: saveMutation.mutateAsync,
    startRun: (config?: DataQualityConfig) => runMutation.mutateAsync(config),
  };
}
