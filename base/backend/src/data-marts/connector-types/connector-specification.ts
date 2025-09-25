import { z } from 'zod';

export const ConnectorSpecification = z.array(
  z.object({
    name: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    default: z
      .union([z.string(), z.number(), z.boolean(), z.object({}), z.array(z.string()), z.unknown()])
      .optional(),
    requiredType: z
      .enum(['string', 'number', 'boolean', 'bool', 'object', 'array', 'date'])
      .optional(),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
    showInUI: z.boolean().default(true),
    attributes: z.array(z.string()).optional(),
  })
);

export type ConnectorSpecification = z.infer<typeof ConnectorSpecification>;
