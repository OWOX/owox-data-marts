import { DataStorageHealthStatus } from '../services/data-storage-health-status.service';

export function getDataStorageHealthSortRank(healthStatus?: DataStorageHealthStatus): number {
  switch (healthStatus) {
    case DataStorageHealthStatus.INVALID:
      return 1;
    case DataStorageHealthStatus.VALID:
      return 2;
    default:
      return 0; // not fetched / loading
  }
}
