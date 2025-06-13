import { BigQueryConfig } from './bigquery/schemas/bigquery-config.schema';
import { AthenaConfig } from './athena/schemas/athena-config.schema';

export type DataStorageConfig = BigQueryConfig | AthenaConfig;
