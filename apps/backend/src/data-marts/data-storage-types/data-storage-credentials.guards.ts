import {
  BIGQUERY_OAUTH_TYPE,
  BigQueryCredentials,
  BigQueryServiceAccountCredentialsSchema,
  BigQueryOAuthCredentials,
} from './bigquery/schemas/bigquery-credentials.schema';
import {
  AthenaCredentials,
  AthenaCredentialsSchema,
} from './athena/schemas/athena-credentials.schema';
import {
  SnowflakeCredentials,
  SnowflakeCredentialsSchema,
} from './snowflake/schemas/snowflake-credentials.schema';
import {
  RedshiftCredentials,
  RedshiftCredentialsSchema,
} from './redshift/schemas/redshift-credentials.schema';
import {
  DatabricksCredentials,
  DatabricksCredentialsSchema,
} from './databricks/schemas/databricks-credentials.schema';

export function isBigQueryOAuthCredentials(
  credentials: unknown
): credentials is BigQueryOAuthCredentials {
  return (
    typeof credentials === 'object' &&
    credentials !== null &&
    (credentials as { type?: string }).type === BIGQUERY_OAUTH_TYPE
  );
}

export function isBigQueryCredentials(
  credentials: unknown
): credentials is BigQueryCredentials | BigQueryOAuthCredentials {
  return (
    isBigQueryOAuthCredentials(credentials) ||
    BigQueryServiceAccountCredentialsSchema.safeParse(credentials).success
  );
}

export function isAthenaCredentials(credentials: unknown): credentials is AthenaCredentials {
  return AthenaCredentialsSchema.safeParse(credentials).success;
}

export function isSnowflakeCredentials(credentials: unknown): credentials is SnowflakeCredentials {
  return SnowflakeCredentialsSchema.safeParse(credentials).success;
}

export function isRedshiftCredentials(credentials: unknown): credentials is RedshiftCredentials {
  return RedshiftCredentialsSchema.safeParse(credentials).success;
}

export function isDatabricksCredentials(
  credentials: unknown
): credentials is DatabricksCredentials {
  return DatabricksCredentialsSchema.safeParse(credentials).success;
}
