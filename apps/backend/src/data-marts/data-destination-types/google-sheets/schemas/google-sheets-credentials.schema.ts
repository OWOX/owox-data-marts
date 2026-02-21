import { z } from 'zod';
import { GoogleServiceAccountKeySchema } from '../../../../common/schemas/google-service-account-key.schema';

/**
 * Type identifier for Google Sheets credentials
 */
export const GoogleSheetsCredentialsType = 'google-sheets-credentials';

/**
 * Schema for validating Google Sheets credentials (Service Account).
 * OAuth is handled via credentialId on the parent entity, not inside credentials JSON.
 */
export const GoogleSheetsCredentialsSchema = z
  .object({
    /**
     * Credentials type identifier
     */
    type: z.literal(GoogleSheetsCredentialsType),

    /**
     * Google service account key used for authentication
     * Contains the necessary credentials for accessing Google Sheets API
     * Optional when OAuth is used (credentials stored in data_destination_credentials table)
     */
    serviceAccountKey: GoogleServiceAccountKeySchema.optional(),
  })
  .passthrough();

/**
 * Type definition for Google Sheets credentials
 * Represents the structure of a validated Google Sheets credentials object
 */
export type GoogleSheetsCredentials = z.infer<typeof GoogleSheetsCredentialsSchema>;
