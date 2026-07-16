import {
  DataMartRunStatus,
  DataMartRunTriggerType,
  DataMartRunType,
  isDataMartRunFinalStatus,
} from '../../../shared';
import type { DataMartRunItem } from '../types';

export function findTerminalTrackedManualConnectorRun(
  runs: readonly DataMartRunItem[],
  trackedRunId: string | null
): DataMartRunItem | null {
  if (!trackedRunId) return null;

  const trackedRun = runs.find(run => run.id === trackedRunId);
  if (
    trackedRun?.type !== DataMartRunType.CONNECTOR ||
    trackedRun.triggerType !== DataMartRunTriggerType.MANUAL ||
    !isDataMartRunFinalStatus(trackedRun.status)
  ) {
    return null;
  }

  return trackedRun;
}

export function countSuccessfulManualConnectorRuns(
  runs: readonly DataMartRunItem[],
  exactRun: DataMartRunItem | null = null
): number {
  const uniqueRuns = new Map(runs.map(run => [run.id, run]));

  if (exactRun) {
    uniqueRuns.set(exactRun.id, exactRun);
  }

  return Array.from(uniqueRuns.values()).filter(
    run =>
      run.status === DataMartRunStatus.SUCCESS &&
      run.triggerType === DataMartRunTriggerType.MANUAL &&
      run.type === DataMartRunType.CONNECTOR
  ).length;
}
