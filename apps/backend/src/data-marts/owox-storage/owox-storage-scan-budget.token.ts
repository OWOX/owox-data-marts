import type { ManagedStorage } from '../entities/managed-storage.entity';
import type { ScanBudget } from '../data-storage-types/bigquery/schemas/bigquery-credentials.schema';

export const OWOX_STORAGE_SCAN_BUDGET = Symbol('OWOX_STORAGE_SCAN_BUDGET');

export interface OwoxStorageScanBudgetFactory {
  forStorage(record: ManagedStorage): ScanBudget;
}
