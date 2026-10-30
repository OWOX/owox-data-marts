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

export interface ManagedStorageEngine {
  provision(input: {
    projectId: string;
    location: OwoxStorageLocation;
  }): Promise<ProvisionedManagedStorage>;
  deprovision(target: ProvisionedManagedStorage): Promise<void>;
}
