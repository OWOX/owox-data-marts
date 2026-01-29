import { z } from 'zod';
import { DatabricksAuthMethod } from '../enums/databricks-auth-method.enum';

export const DatabricksCredentialsSchema = z.object({
  authMethod: z.literal(DatabricksAuthMethod.PERSONAL_ACCESS_TOKEN),
  token: z.string().min(1),
});

export type DatabricksCredentials = z.infer<typeof DatabricksCredentialsSchema>;
