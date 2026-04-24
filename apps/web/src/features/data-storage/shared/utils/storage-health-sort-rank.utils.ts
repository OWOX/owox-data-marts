import { DataStorageHealthStatus } from '../services/data-storage-health-status.service';

// Sort priority: not fetched (0) → unconfigured (1) → invalid (2) → valid (3).
// UNCONFIGURED ranks above INVALID because a new storage that hasn't been set up yet
// is expected and actionable, while INVALID indicates a regression that needs attention.
// Lower rank = appears first when sorted ascending.
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
