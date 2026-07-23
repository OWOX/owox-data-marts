import type { DataQualitySummaryState } from '../../types';

export function isDataQualityActivityState(state: DataQualitySummaryState | undefined): boolean {
  return state === 'QUEUED' || state === 'RUNNING';
}

export function getDataMartRunActivityLabel(
  hasDataUpdate: boolean,
  hasDataQuality: boolean
): string | null {
  if (hasDataUpdate && hasDataQuality) return 'Runs in progress';
  if (hasDataQuality) return 'Checking data quality';
  if (hasDataUpdate) return 'Updating data';
  return null;
}
