import type { BigQueryServiceAccountCredentials } from '../data-storage-types/bigquery/schemas/bigquery-credentials.schema';
import type { AthenaCredentials } from '../data-storage-types/athena/schemas/athena-credentials.schema';
import type { SnowflakeCredentials } from '../data-storage-types/snowflake/schemas/snowflake-credentials.schema';
import type { RedshiftCredentials } from '../data-storage-types/redshift/schemas/redshift-credentials.schema';
import type { DatabricksCredentials } from '../data-storage-types/databricks/schemas/databricks-credentials.schema';
import type { GoogleOAuthTokens } from '../services/google-oauth/google-oauth-flow.service';

/**
 * Union of all credential shapes actually stored in the
 * data_storage_credentials JSON column.
 *
 * Note: BigQueryOAuthCredentials (with OAuth2Client) is NOT stored —
 * it's reconstructed at runtime. OAuth rows store GoogleOAuthTokens instead.
 */
export type StoredStorageCredentials =
  | BigQueryServiceAccountCredentials
  | AthenaCredentials
  | SnowflakeCredentials
  | RedshiftCredentials
  | DatabricksCredentials
  | GoogleOAuthTokens;
