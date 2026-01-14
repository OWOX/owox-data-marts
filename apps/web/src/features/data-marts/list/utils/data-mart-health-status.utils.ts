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
 * Flags for run statuses.
 */
interface RunStatusFlags {
  hasSuccess: boolean;
  hasFailure: boolean;
  hasInProgress: boolean;
}

/**
 * Health status rule.
 */
interface HealthStatusRule {
  when: (flags: RunStatusFlags) => boolean;
  status: DataMartHealthStatus;
}

const HEALTH_STATUS_RULES: HealthStatusRule[] = [
  {
    when: ({ hasInProgress, hasSuccess, hasFailure }) =>
      hasInProgress && !hasSuccess && !hasFailure,
    status: DataMartHealthStatus.RUNS_IN_PROGRESS,
  },
  {
    when: ({ hasFailure, hasSuccess, hasInProgress }) =>
      hasFailure && !hasSuccess && !hasInProgress,
    status: DataMartHealthStatus.ALL_RUNS_FAILED,
  },
  {
    when: ({ hasSuccess, hasFailure, hasInProgress }) =>
      hasSuccess && !hasFailure && !hasInProgress,
    status: DataMartHealthStatus.ALL_RUNS_SUCCESS,
  },
];

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
  if (!recentRuns.length) {
    return DataMartHealthStatus.NO_RUNS;
  }

  const flags: RunStatusFlags = {
    hasSuccess: false,
    hasFailure: false,
    hasInProgress: false,
  };

  for (const { status } of recentRuns) {
    if (status === DataMartRunStatus.SUCCESS) flags.hasSuccess = true;
    else if (status === DataMartRunStatus.FAILED) flags.hasFailure = true;
    else if (status === DataMartRunStatus.PENDING || status === DataMartRunStatus.RUNNING) {
      flags.hasInProgress = true;
    }
  }

  const matchedRule = HEALTH_STATUS_RULES.find(rule => rule.when(flags));

  return matchedRule ? matchedRule.status : DataMartHealthStatus.MIXED_RUNS;
}
