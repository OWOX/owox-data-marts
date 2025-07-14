import {
  BigQueryCredentials,
  BigQueryCredentialsSchema,
} from './bigquery/schemas/bigquery-credentials.schema';
import {
  AthenaCredentials,
  AthenaCredentialsSchema,
} from './athena/schemas/athena-credentials.schema';

export function isBigQueryCredentials(credentials: unknown): credentials is BigQueryCredentials {
  return BigQueryCredentialsSchema.safeParse(credentials).success;
}

export function isAthenaCredentials(credentials: unknown): credentials is AthenaCredentials {
  return AthenaCredentialsSchema.safeParse(credentials).success;
}
