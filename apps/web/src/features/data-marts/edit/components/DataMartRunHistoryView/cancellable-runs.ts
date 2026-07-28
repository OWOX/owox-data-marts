import { DataMartRunStatus, DataMartRunType } from '../../../shared';

const CANCELLABLE_RUN_TYPES = new Set<DataMartRunType>([
  DataMartRunType.CONNECTOR,
  DataMartRunType.GOOGLE_SHEETS_EXPORT,
  DataMartRunType.EMAIL,
  DataMartRunType.SLACK,
  DataMartRunType.MS_TEAMS,
  DataMartRunType.GOOGLE_CHAT,
  DataMartRunType.DATA_QUALITY,
]);

const CANCELLABLE_RUN_STATUSES = new Set<DataMartRunStatus>([
  DataMartRunStatus.PENDING,
  DataMartRunStatus.RUNNING,
]);

export function canCancelDataMartRun(type: DataMartRunType, status: DataMartRunStatus): boolean {
  return CANCELLABLE_RUN_TYPES.has(type) && CANCELLABLE_RUN_STATUSES.has(status);
}
