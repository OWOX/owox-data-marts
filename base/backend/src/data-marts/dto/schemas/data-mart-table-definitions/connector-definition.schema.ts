import { z } from 'zod';

export const ConnectorSourceSchema = z.object({
  name: z.string().min(1, 'Connector name is required'),
  configuration: z
    .array(z.record(z.string(), z.any()))
    .min(1, 'At least one configuration is required'),
  node: z.string().min(1, 'Node is required'),
  fields: z.array(z.string()).min(1, 'At least one field is required'),
});

export const ConnectorStorageSchema = z.object({
  fullyQualifiedName: z.string().min(1, 'fully qualified name is required'),
});

export const ConnectorSchema = z.object({
  source: ConnectorSourceSchema,
  storage: ConnectorStorageSchema,
});

export const ConnectorDefinitionSchema = z.object({
  connector: ConnectorSchema,
});

export type ConnectorSource = z.infer<typeof ConnectorSourceSchema>;
export type ConnectorStorage = z.infer<typeof ConnectorStorageSchema>;
export type Connector = z.infer<typeof ConnectorSchema>;
export type ConnectorDefinition = z.infer<typeof ConnectorDefinitionSchema>;
