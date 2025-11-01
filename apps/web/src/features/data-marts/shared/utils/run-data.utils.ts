import type { DataMartRunItem } from '../../edit';
import { DataMartRunStatus } from '../enums';

export interface RunDataInfo {
  lastRunDate: Date | null;
  lastRunStatus: DataMartRunStatus | null;
  totalRuns: number;
  firstRunDate: Date | null;
}

export function getRunDataInfo(runs: DataMartRunItem[]): RunDataInfo {
  if (runs.length === 0) {
    return {
      lastRunDate: null,
      lastRunStatus: null,
      totalRuns: 0,
      firstRunDate: null,
    };
  }

  const lastRun = runs[0]; // Runs are ordered by createdAt DESC
  const firstRun = runs[runs.length - 1]; // First run is the last item in the array

  const firstRunDate = new Date(firstRun.createdAt);
  const lastRunDate = new Date(lastRun.createdAt);

  return {
    lastRunDate,
    lastRunStatus: lastRun.status,
    totalRuns: runs.length,
    firstRunDate,
  };
}
