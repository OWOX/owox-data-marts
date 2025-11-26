import { z } from 'zod';

export const ConnectorSpecificationItem = z.object({
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
  attributes: z.array(z.string()).optional(),
  oauthParams: z.record(z.string(), z.unknown()).optional(),
});

export const ConnectorSpecificationSchema = ConnectorSpecificationItem.extend({
  oneOf: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        requiredType: z
          .enum(['string', 'number', 'boolean', 'bool', 'object', 'array', 'date'])
          .optional(),
        attributes: z.array(z.string()).optional(),
        oauthParams: z.record(z.string(), z.unknown()).optional(),
        items: z.record(z.string(), ConnectorSpecificationItem),
      })
    )
    .optional(),
});

export const ConnectorSpecification = z.array(ConnectorSpecificationSchema);

export type ConnectorSpecification = z.infer<typeof ConnectorSpecification>;
export type ConnectorSpecificationItem = z.infer<typeof ConnectorSpecificationItem>;
export type ConnectorSpecificationSchema = z.infer<typeof ConnectorSpecificationSchema>;
