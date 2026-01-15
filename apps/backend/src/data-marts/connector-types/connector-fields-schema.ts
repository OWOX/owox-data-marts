import { z } from 'zod';

export const ConnectorFieldsSchema = z.array(
  z.object({
    name: z.string(),
    overview: z.string().optional(),
    description: z.string().optional(),
    documentation: z.string().optional(),
    uniqueKeys: z.array(z.string()).optional(),
    defaultFields: z.array(z.string()).optional(),
    destinationName: z.string().optional(),
    fields: z
      .array(
        z.object({
          name: z.string(),
          type: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .optional(),
  })
);

export type ConnectorFieldsSchema = z.infer<typeof ConnectorFieldsSchema>;
