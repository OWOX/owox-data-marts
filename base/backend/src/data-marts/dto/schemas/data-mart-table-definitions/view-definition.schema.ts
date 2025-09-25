import { z } from 'zod';

export const ViewDefinitionSchema = z.object({
  fullyQualifiedName: z.string().min(1, 'fully qualified name is required'),
});

export type ViewDefinition = z.infer<typeof ViewDefinitionSchema>;
