import type { DataMartRunItem } from '../../edit/model/types/data-mart-run';
import { DataMartRunStatus } from '../../shared/enums/data-mart-run-status.enum';
import { DataMartStatus } from '../../shared/enums/data-mart-status.enum';
import { DataMartHealthStatus } from '../../shared/types';

/**
 * Milliseconds per day.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Numeric rank for sorting Data Marts by run health.
 * Higher = healthier / more actionable.
 */
export enum HealthStatusSortRank {
  DRAFT = 0,
  NOT_FETCHED = 1,
  NO_RUNS = 2,
  RUNS_IN_PROGRESS = 3,
  ALL_RUNS_FAILED = 4,
  MIXED_RUNS = 5,
  ALL_RUNS_SUCCESS = 6,
}

const SORT_RANK_BY_HEALTH_STATUS: Record<DataMartHealthStatus, HealthStatusSortRank> = {
  [DataMartHealthStatus.NO_RUNS]: HealthStatusSortRank.NO_RUNS,
  [DataMartHealthStatus.RUNS_IN_PROGRESS]: HealthStatusSortRank.RUNS_IN_PROGRESS,
  [DataMartHealthStatus.ALL_RUNS_FAILED]: HealthStatusSortRank.ALL_RUNS_FAILED,
  [DataMartHealthStatus.MIXED_RUNS]: HealthStatusSortRank.MIXED_RUNS,
  [DataMartHealthStatus.ALL_RUNS_SUCCESS]: HealthStatusSortRank.ALL_RUNS_SUCCESS,
};

/**
 * Maps Data Mart state + indicator color to sortable rank.
 */
export function getHealthStatusSortRank(params: {
  dataMartStatus: DataMartStatus;
  healthStatus?: DataMartHealthStatus;
}): HealthStatusSortRank {
  const { dataMartStatus, healthStatus } = params;

  if (dataMartStatus === DataMartStatus.DRAFT) {
    return HealthStatusSortRank.DRAFT;
  }

  if (!healthStatus) {
    return HealthStatusSortRank.NOT_FETCHED;
  }

  return SORT_RANK_BY_HEALTH_STATUS[healthStatus];
}

/**
 * Filters runs to only include those within the specified number of days.
 *
 * NOTE:
 * Assumes runs are already mapped DataMartRunItem entities,
 * same as in Data Mart Run History.
 */
export function filterRunsByDateRange(
  runs: readonly DataMartRunItem[],
  days: number
): DataMartRunItem[] {
  const cutoffDate = new Date(Date.now() - days * MS_PER_DAY);

  return runs.filter(run => run.createdAt >= cutoffDate);
}

/**
 * Computes aggregated Data Mart health status based on recent runs.
 *
 * IMPORTANT:
 * - Expects runs to be already filtered by date.
 * - Contains NO UI logic.
 */
export function computeDataMartHealthStatus(
  recentRuns: readonly DataMartRunItem[]
): DataMartHealthStatus {
  if (recentRuns.length === 0) {
    return DataMartHealthStatus.NO_RUNS;
  }

  const statuses = new Set(recentRuns.map(run => run.status));

  const hasSuccess = statuses.has(DataMartRunStatus.SUCCESS);
  const hasFailure = statuses.has(DataMartRunStatus.FAILED);
  const hasInProgress =
    statuses.has(DataMartRunStatus.PENDING) || statuses.has(DataMartRunStatus.RUNNING);

  if (hasInProgress && !hasSuccess && !hasFailure) {
    return DataMartHealthStatus.RUNS_IN_PROGRESS;
  }

  if (hasFailure && !hasSuccess && !hasInProgress) {
    return DataMartHealthStatus.ALL_RUNS_FAILED;
  }

  if (hasSuccess && !hasFailure && !hasInProgress) {
    return DataMartHealthStatus.ALL_RUNS_SUCCESS;
  }

  return DataMartHealthStatus.MIXED_RUNS;
}
