import { z } from 'zod';
import { ConfigFieldType } from '../enums/config-field-type.enum';
import { ConnectionConfigSchema } from './connection-config.schema';
import { ConnectorRequestConfigV1Schema } from './connector-request-config.schema.v1';

// Schema for select field options
export const ConfigSelectOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});

// Schema for configuration field
export const ConfigFieldSchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  helpText: z.string().optional(),
  placeholder: z.string().optional(),
  text: z.string().optional(),
  type: z.nativeEnum(ConfigFieldType),
  options: z.array(ConfigSelectOptionSchema).optional(),
  isDynamic: z.boolean().optional(),
});

// Schema for getConfig request
export const GetConfigRequestSchema = z.object({
  connectionConfig: ConnectionConfigSchema,
  request: z.object({
    configParams: ConnectorRequestConfigV1Schema.optional(),
  }),
});

// Schema for getConfig response
export const GetConfigResponseSchema = z.object({
  configParams: z.array(ConfigFieldSchema),
  dateRangeRequired: z.boolean().optional(),
  isSteppedConfig: z.boolean().optional(),
});

export type ConfigSelectOption = z.infer<typeof ConfigSelectOptionSchema>;
export type ConfigField = z.infer<typeof ConfigFieldSchema>;
export type GetConfigRequest = z.infer<typeof GetConfigRequestSchema>;
export type GetConfigResponse = z.infer<typeof GetConfigResponseSchema>;
