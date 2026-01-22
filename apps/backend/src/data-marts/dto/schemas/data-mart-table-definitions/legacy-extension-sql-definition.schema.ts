import { z } from 'zod';

export const LegacyExtensionSqlDefinitionSchemaType = 'legacy-extension-sql';

export const LegacyExtensionSqlDefinitionSchema = z.object({
  type: z.literal(LegacyExtensionSqlDefinitionSchemaType),
  query: z.string().min(1, 'sql query is required'),
});

export type LegacyExtensionSqlDefinition = z.infer<typeof LegacyExtensionSqlDefinitionSchema>;

