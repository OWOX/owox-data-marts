import type { OwoxStorageLocation } from '../owox-storage-settings';

export const MANAGED_STORAGE_ENGINE = Symbol('MANAGED_STORAGE_ENGINE');

export interface ProvisionedManagedStorage {
  engine: 'bigquery';
  gcpProjectId: string;
  location: OwoxStorageLocation;
  datasetId: string;
  internalDatasetId: string;
  serviceAccountEmail: string;
}

export interface ManagedTable {
  name: string;
  sizeBytes: number;
  rowCount: number;
}

export interface ManagedStorageEngine {
  provision(input: {
    projectId: string;
    location: OwoxStorageLocation;
  }): Promise<ProvisionedManagedStorage>;
  deprovision(target: ProvisionedManagedStorage): Promise<void>;
  listTables(target: ProvisionedManagedStorage): Promise<ManagedTable[]>;
  /** Newest job per service account since `since`, keyed by email; accounts with no job are absent. */
  lastJobTimes(targets: ProvisionedManagedStorage[], since: Date): Promise<Map<string, Date>>;
  dropTable(target: ProvisionedManagedStorage, tableName: string): Promise<void>;
}
