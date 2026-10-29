import type { DataStorageType, StorageCredentialSummary } from '../../../model/types';
import type { ContextSummary } from '../../../../../contexts/types/context.types';

export interface GoogleBigQueryConfigDto {
  projectId: string;
  location: string;
}

export interface AwsAthenaConfigDto {
  region: string;
  outputBucket: string;
}

export interface SnowflakeConfigDto {
  account: string;
  warehouse: string;
}

export interface RedshiftConfigDto {
  connectionType?: string;
  region: string;
  database: string;
  workgroupName?: string;
  clusterIdentifier?: string;
  schema?: string;
}

export interface DatabricksConfigDto {
  host: string;
  httpPath: string;
}

// Wire-format mirror of the empty DuckDbDataStorageConfig.
export type DuckDbConfigDto = Record<string, never>;

export type DataStorageConfigDto =
  | GoogleBigQueryConfigDto
  | AwsAthenaConfigDto
  | SnowflakeConfigDto
  | RedshiftConfigDto
  | DatabricksConfigDto
  | DuckDbConfigDto;

export interface DataStorageResponseDto {
  id: string;
  title: string;
  type: DataStorageType;
  config: DataStorageConfigDto | null;
  createdAt: string;
  modifiedAt: string;
  publishedDataMartsCount: number;
  draftDataMartsCount: number;
  /** Absent where a Storage is embedded in another resource. */
  reusableCredential?: StorageCredentialSummary | null;
  createdByUser?: import('../../../../../../shared/types').UserProjection | null;
  ownerUsers?: import('../../../../../../shared/types').UserProjection[];
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
  contexts?: ContextSummary[];
  /** DuckDB only: server-managed absolute path of the .duckdb file (read-only). */
  databasePath?: string;
}
