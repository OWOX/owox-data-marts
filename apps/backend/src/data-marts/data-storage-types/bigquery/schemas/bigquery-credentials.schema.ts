import { z } from 'zod';
import { GoogleServiceAccountKeySchema } from '../../../../common/schemas/google-service-account-key.schema';

export const BigQueryCredentialsSchema = GoogleServiceAccountKeySchema.extend({});

export type BigQueryCredentials = z.infer<typeof BigQueryCredentialsSchema>;
