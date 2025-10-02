import { z } from 'zod';

export const ConnectorDefinitionSchema = z.object({
  name: z.string().min(1, 'name is required'),
  title: z.string(),
  description: z.string().nullable(),
  logo: z.string().nullable(),
  docUrl: z.string().nullable(),
});

export type ConnectorDefinition = z.infer<typeof ConnectorDefinitionSchema>;
