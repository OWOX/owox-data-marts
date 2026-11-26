import type { OwoxStorageLocation } from '../owox-storage-settings';

export const MANAGED_STORAGE_ENGINE = Symbol('MANAGED_STORAGE_ENGINE');

export interface ProvisionedManagedStorage {
  engine: 'bigquery';
  /** The OWOX project that owns the storage. */
  projectId: string;
  /** The GCP project that holds the datasets. */
  gcpProjectId: string;
  /** The GCP project where the storage's jobs run; a job reads `dataset.table` in it. */
  processProjectId: string;
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
  /**
   * Creates the target's datasets, account and grants again; never undoes. With `leftovers` (the last deletion did
   * not finish), it first deletes what that deletion left.
   */
  restore(target: ProvisionedManagedStorage, projectId: string, leftovers: boolean): Promise<void>;
  deprovision(target: ProvisionedManagedStorage): Promise<void>;
  listTables(target: ProvisionedManagedStorage): Promise<ManagedTable[]>;
  dropTable(
    target: ProvisionedManagedStorage,
    tableName: string,
    generation?: string
  ): Promise<void>;
}
