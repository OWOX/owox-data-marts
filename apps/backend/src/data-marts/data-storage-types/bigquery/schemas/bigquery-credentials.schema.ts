import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { GoogleServiceAccountKeySchema } from '../../../../common/schemas/google-service-account-key.schema';

export const BigQueryServiceAccountCredentialsSchema = GoogleServiceAccountKeySchema.extend({});

export type BigQueryServiceAccountCredentials = z.infer<
  typeof BigQueryServiceAccountCredentialsSchema
>;

/**
 * In-process OAuth credentials for BigQuery.
 * Not serializable — used only within the runtime, never stored in DB.
 * Created by DataStorageCredentialsResolver before entering the executor chain.
 */
export const BIGQUERY_OAUTH_TYPE = 'bigquery_oauth' as const;

export const BigQueryOAuthCredentialsSchema = z.object({
  type: z.literal(BIGQUERY_OAUTH_TYPE),
  oauth2Client: z.instanceof(OAuth2Client),
});

export type BigQueryOAuthCredentials = z.infer<typeof BigQueryOAuthCredentialsSchema>;

export type BigQueryCredentials = BigQueryServiceAccountCredentials | BigQueryOAuthCredentials;
