import { DataStorageHealthStatus } from '../services/data-storage-health-status.service';

export function getDataStorageHealthSortRank(healthStatus?: DataStorageHealthStatus): number {
  switch (healthStatus) {
    case DataStorageHealthStatus.UNCONFIGURED:
      return 1;
    case DataStorageHealthStatus.INVALID:
      return 2;
    case DataStorageHealthStatus.VALID:
      return 3;
    default:
      return 0; // not fetched / loading
  }
}
