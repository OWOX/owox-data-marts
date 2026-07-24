import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';

export const CANCELLABLE_DATA_MART_RUN_STATUSES = [
  DataMartRunStatus.PENDING,
  DataMartRunStatus.RUNNING,
];

/**
 * Statuses a run has not yet moved out of; every other status is terminal.
 *
 * Deliberately an alias rather than a second literal: a run is cancellable
 * exactly while it is still non-terminal, so the two sets must not drift apart.
 */
export const NON_TERMINAL_DATA_MART_RUN_STATUSES = CANCELLABLE_DATA_MART_RUN_STATUSES;

export const STANDARD_REPORT_RUN_TYPES = [
  DataMartRunType.GOOGLE_SHEETS_EXPORT,
  DataMartRunType.EMAIL,
  DataMartRunType.SLACK,
  DataMartRunType.MS_TEAMS,
  DataMartRunType.GOOGLE_CHAT,
];

const CANCELLABLE_DATA_MART_RUN_STATUS_SET = new Set<DataMartRunStatus>(
  CANCELLABLE_DATA_MART_RUN_STATUSES
);
const STANDARD_REPORT_RUN_TYPE_SET = new Set<DataMartRunType>(STANDARD_REPORT_RUN_TYPES);

export function isCancellableDataMartRunStatus(status: DataMartRunStatus): boolean {
  return CANCELLABLE_DATA_MART_RUN_STATUS_SET.has(status);
}

export function isStandardReportRunType(type: DataMartRunType): boolean {
  return STANDARD_REPORT_RUN_TYPE_SET.has(type);
}
