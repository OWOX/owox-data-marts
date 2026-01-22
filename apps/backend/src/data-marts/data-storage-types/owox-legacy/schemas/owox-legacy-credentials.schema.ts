import { z } from 'zod';
import { GoogleServiceAccountKeySchema } from '../../../../common/schemas/google-service-account-key.schema';

/**
 * Credentials schema for OWOX Legacy storage.
 * Same as BigQuery credentials (Google Service Account).
 */
export const OwoxLegacyCredentialsSchema = GoogleServiceAccountKeySchema.extend({});

export type OwoxLegacyCredentials = z.infer<typeof OwoxLegacyCredentialsSchema>;
