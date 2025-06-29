import { BigQueryConfig, BigQueryConfigSchema } from './bigquery/schemas/bigquery-config.schema';
import { AthenaConfig, AthenaConfigSchema } from './athena/schemas/athena-config.schema';

export function isBigQueryConfig(config: unknown): config is BigQueryConfig {
  return BigQueryConfigSchema.safeParse(config).success;
}

export function isAthenaConfig(config: unknown): config is AthenaConfig {
  return AthenaConfigSchema.safeParse(config).success;
}
