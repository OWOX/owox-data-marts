import type { DataStorageType } from './data-storage-type.enum';

export interface Connector {
  name: string;
  configuration: Record<string, unknown>;
  nodes: string[];
  fields: string[];
  target: {
    type: DataStorageType;
    bigquery?: { datasetId: string };
    athena?: { databaseName: string };
  };
}
