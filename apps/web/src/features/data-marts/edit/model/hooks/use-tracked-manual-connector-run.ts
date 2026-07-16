import { useQuery } from '@tanstack/react-query';
import { isDataMartRunFinalStatus } from '../../../shared';
import type { DataMartRunItem } from '../types';

const EXACT_RUN_POLL_INTERVAL_MS = 5_000;

interface GetDataMartRunByIdOptions {
  silent?: boolean;
}

export type GetDataMartRunById = (
  dataMartId: string,
  runId: string,
  options?: GetDataMartRunByIdOptions
) => Promise<DataMartRunItem>;

interface UseTrackedManualConnectorRunOptions {
  dataMartId: string;
  trackedRunId: string | null;
  runs: readonly DataMartRunItem[];
  getDataMartRunById: GetDataMartRunById;
}

export function useTrackedManualConnectorRun({
  dataMartId,
  trackedRunId,
  runs,
  getDataMartRunById,
}: UseTrackedManualConnectorRunOptions) {
  const trackedRun = trackedRunId ? runs.find(run => run.id === trackedRunId) : null;
  const shouldPollExactRun = Boolean(
    trackedRunId && (!trackedRun || !isDataMartRunFinalStatus(trackedRun.status))
  );

  return useQuery({
    queryKey: ['data-mart', dataMartId, 'manual-connector-run', trackedRunId ?? ''],
    queryFn: () => getDataMartRunById(dataMartId, trackedRunId ?? '', { silent: true }),
    enabled: Boolean(dataMartId && trackedRunId && shouldPollExactRun),
    retry: false,
    refetchInterval: EXACT_RUN_POLL_INTERVAL_MS,
  });
}
