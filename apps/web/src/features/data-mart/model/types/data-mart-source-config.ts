import type { SqlSourceConfig } from './sql-source-config.ts';
import type { DirectStorageConfig } from './direct-storage-config.ts';
import type { ConnectorConfig } from './connector-config.ts';
import { DataMartSourceType } from './data-mart-source-type.enum.ts';

export type DataMartSourceConfig =
  | { type: DataMartSourceType.SQL; config: SqlSourceConfig }
  | { type: DataMartSourceType.DIRECT_STORAGE; config: DirectStorageConfig }
  | { type: DataMartSourceType.CONNECTOR; config: ConnectorConfig };
