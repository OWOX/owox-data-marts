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
  oauthClientId: z.string(),
});

export type BigQueryOAuthCredentials = z.infer<typeof BigQueryOAuthCredentialsSchema>;

/** An OWOX Storage: queries run as its own service account, impersonated from ODM's identity. */
export const BIGQUERY_MANAGED_TYPE = 'bigquery_managed' as const;

export interface ScanReservation {
  maximumBytesBilled: number;
  release(): void;
}

export interface ScanBudget {
  remainingBytes(): Promise<number>;
  reserve(estimatedBytes: number): Promise<ScanReservation>;
}

export interface BigQueryManagedCredentials {
  type: typeof BIGQUERY_MANAGED_TYPE;
  authClient: OAuth2Client;
  serviceAccountEmail: string;
  datasetId: string;
  internalDatasetId: string;
  scanBudget: ScanBudget;
}

export type BigQueryCredentials =
  | BigQueryServiceAccountCredentials
  | BigQueryOAuthCredentials
  | BigQueryManagedCredentials;
