import { z } from 'zod';

export const SqlDefinitionSchema = z.object({
  sqlQuery: z.string().min(1, 'sql query is required'),
});

export type SqlDefinition = z.infer<typeof SqlDefinitionSchema>;
