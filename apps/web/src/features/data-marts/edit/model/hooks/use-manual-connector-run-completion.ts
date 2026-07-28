import { useEffect, useRef } from 'react';
import { findTerminalTrackedManualConnectorRun } from '../helpers/find-terminal-tracked-manual-connector-run.helper';
import type { DataMartRunItem } from '../types';
import {
  useTrackedManualConnectorRun,
  type GetDataMartRunById,
} from './use-tracked-manual-connector-run';

interface UseManualConnectorRunCompletionOptions {
  enabled: boolean;
  dataMartId: string;
  trackedRunId: string | null;
  runs: readonly DataMartRunItem[];
  getDataMartRunById: GetDataMartRunById;
  resetManualRunTriggered: (completedRun?: DataMartRunItem) => void;
  onCompleted: (run: DataMartRunItem) => void;
}

export function useManualConnectorRunCompletion({
  enabled,
  dataMartId,
  trackedRunId,
  runs,
  getDataMartRunById,
  resetManualRunTriggered,
  onCompleted,
}: UseManualConnectorRunCompletionOptions) {
  const processedRunIdRef = useRef<string | null>(null);
  const exactRunQuery = useTrackedManualConnectorRun({
    dataMartId,
    trackedRunId: enabled ? trackedRunId : null,
    runs,
    getDataMartRunById,
  });
  const exactRun = exactRunQuery.data ?? null;

  useEffect(() => {
    if (!enabled || !trackedRunId) {
      processedRunIdRef.current = null;
      return;
    }

    const completedRun =
      findTerminalTrackedManualConnectorRun(runs, trackedRunId) ??
      findTerminalTrackedManualConnectorRun(exactRun ? [exactRun] : [], trackedRunId);

    if (!completedRun || processedRunIdRef.current === completedRun.id) return;

    processedRunIdRef.current = completedRun.id;
    resetManualRunTriggered(completedRun);
    onCompleted(completedRun);
  }, [enabled, exactRun, onCompleted, resetManualRunTriggered, runs, trackedRunId]);

  return exactRunQuery;
}
