import { z } from 'zod';

export const TableDefinitionSchema = z.object({
  fullyQualifiedName: z.string().min(1, 'fully qualified name is required'),
});

export type TableDefinition = z.infer<typeof TableDefinitionSchema>;
