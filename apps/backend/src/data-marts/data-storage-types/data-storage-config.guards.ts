import { BigQueryConfig, BigQueryConfigSchema } from './bigquery/schemas/bigquery-config.schema';
import { AthenaConfig, AthenaConfigSchema } from './athena/schemas/athena-config.schema';
import {
  SnowflakeConfig,
  SnowflakeConfigSchema,
} from './snowflake/schemas/snowflake-config.schema';
import { RedshiftConfig, RedshiftConfigSchema } from './redshift/schemas/redshift-config.schema';

export function isBigQueryConfig(config: unknown): config is BigQueryConfig {
  return BigQueryConfigSchema.safeParse(config).success;
}

export function isAthenaConfig(config: unknown): config is AthenaConfig {
  return AthenaConfigSchema.safeParse(config).success;
}

export function isSnowflakeConfig(config: unknown): config is SnowflakeConfig {
  return SnowflakeConfigSchema.safeParse(config).success;
}

export function isRedshiftConfig(config: unknown): config is RedshiftConfig {
  return RedshiftConfigSchema.safeParse(config).success;
}
