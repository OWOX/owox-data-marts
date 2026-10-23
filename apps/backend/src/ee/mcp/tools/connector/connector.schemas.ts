import { z } from 'zod-v4';

export const connectorNextStepsOutput = {
  next_steps: z
    .array(z.string())
    .min(1)
    .describe(
      'Ordered next actions for the assistant, including any UI authorization and user confirmation needed before continuing.'
    ),
};

export const connectorNameSchema = z
  .string()
  .trim()
  .min(1)
  .describe('Connector source name returned by list_connectors; preserve its spelling and case.');

export const connectorTargetShape = {
  connector_name: connectorNameSchema,
  version: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Applies only to published custom connector versions. Omit for the active published custom version or a bundled connector.'
    ),
};

const connectorPreviewShape = {
  connector_name: connectorNameSchema,
  configuration: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Connector-specific non-secret parameter overrides, preserving names from get_connector_specification. Each supplied top-level parameter replaces the saved value; omitted parameters are reused from the selected source. Complete authentication in the web app instead of sending secrets.'
    ),
  source_data_mart_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Source data_mart_id from list_connector_configurations. Supply together with source_configuration_id to resolve saved credentials on the server; requires EDIT access to the source Data Mart.'
    ),
  source_configuration_id: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Source configuration_id from list_connector_configurations. Supply together with source_data_mart_id; do not send credential IDs or masked values as credentials.'
    ),
};

export const connectorPreviewInputSchema = z
  .object(connectorPreviewShape)
  .strict()
  .refine(
    input =>
      (input.source_data_mart_id === undefined) === (input.source_configuration_id === undefined),
    {
      message: 'source_data_mart_id and source_configuration_id must be supplied together',
      path: ['source_configuration_id'],
    }
  );

export const connectorFieldOptionsPreviewInputSchema = connectorPreviewInputSchema.safeExtend({
  field: z
    .string()
    .trim()
    .min(1)
    .describe(
      'Configuration parameter name from get_connector_specification with the DYNAMIC_OPTIONS attribute. Fill its optionsDependsOn parameters in configuration when required.'
    ),
});

export const connectorSummarySchema = z.object({
  id: z.string().nullable().describe('Project connector ID, or null for a bundled connector.'),
  name: z
    .string()
    .describe('Connector source name used as connector_name and connector.source.name.'),
  title: z.string().describe('Connector display name.'),
  description: z.string().nullable().describe('Connector description, or null when unavailable.'),
  doc_url: z.string().nullable().describe('Connector documentation URL, or null when unavailable.'),
  is_custom: z.boolean().describe('Whether this is a published custom connector in the project.'),
  active_version: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe('Active published custom connector version, or null for a bundled connector.'),
  capabilities: z
    .object({
      singleConfiguration: z
        .boolean()
        .describe('Whether only one source configuration is supported.'),
      copySecretsByValue: z
        .boolean()
        .describe('Whether saved source secrets are copied by value during configuration reuse.'),
    })
    .describe('Connector capabilities using the existing connector API names.'),
});

const parameterTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'bool',
  'object',
  'array',
  'date',
]);

const connectorParameterItemSchema = z.object({
  name: z.string().describe('Connector-specific configuration parameter name.'),
  title: z.string().optional().describe('Parameter display label.'),
  description: z.string().optional().describe('Parameter usage guidance.'),
  default: z.unknown().optional().describe('Public default value; secret defaults are omitted.'),
  requiredType: parameterTypeSchema.optional().describe('Expected connector parameter value type.'),
  required: z.boolean().optional().describe('Whether this parameter is required.'),
  options: z.array(z.string()).optional().describe('Static allowed parameter values.'),
  placeholder: z.string().optional().describe('Suggested parameter input placeholder.'),
  minimum: z.number().optional().describe('Minimum parameter value when defined by the connector.'),
  attributes: z
    .array(z.string())
    .optional()
    .describe('Connector attributes such as SECRET, DYNAMIC_FIELDS, and DYNAMIC_OPTIONS.'),
  optionsDependsOn: z
    .array(z.string())
    .optional()
    .describe('Parameters required by preview_connector_field_options for dynamic options.'),
});

export const connectorParameterSchema = connectorParameterItemSchema.extend({
  oneOf: z
    .array(
      z.object({
        label: z.string().describe('Conditional configuration option label.'),
        value: z.string().describe('Value that selects this conditional configuration option.'),
        requiredType: parameterTypeSchema.optional(),
        attributes: z.array(z.string()).optional(),
        items: z
          .record(z.string(), connectorParameterItemSchema)
          .describe('Conditional parameters keyed by their connector-specific names.'),
      })
    )
    .optional()
    .describe('Conditional configuration alternatives without OAuth settings or secret defaults.'),
});

export const connectorNodeSchema = z.object({
  name: z.string().describe('Connector entity/node name for connector.source.node.'),
  overview: z.string().optional().describe('Brief node overview.'),
  description: z.string().optional().describe('Node description.'),
  documentation: z.string().optional().describe('Connector-provided node documentation.'),
  uniqueKeys: z
    .array(z.string())
    .optional()
    .describe('Fields that uniquely identify a source row.'),
  uniqueKeysByDataLevel: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .describe('Unique source keys for each connector data level.'),
  defaultFields: z
    .array(z.string())
    .optional()
    .describe('Suggested fields for connector.source.fields.'),
  destinationName: z.string().optional().describe('Suggested destination table name.'),
  fields: z
    .array(
      z.object({
        name: z.string().describe('Source field name for connector.source.fields.'),
        type: z.string().optional().describe('Connector-provided field type.'),
        description: z.string().optional().describe('Source field description.'),
      })
    )
    .optional()
    .describe('Fields exposed by this connector node.'),
});

export const connectorConfigurationSchema = z.object({
  data_mart_id: z.string().uuid().describe('Public source Data Mart ID for configuration reuse.'),
  data_mart_title: z.string().describe('Source Data Mart display name.'),
  configuration_id: z.string().describe('Public source configuration ID for configuration reuse.'),
  connector_name: z.string().describe('Connector source name for this configuration.'),
  version: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe('Saved connector version, or null when the default is used.'),
  configuration: z
    .record(z.string(), z.unknown())
    .describe(
      'Connector-specific configuration with secret values masked and existing parameter names preserved. This arbitrary record varies by connector. Use the public source IDs to reuse credentials on the server; masked values are not credentials.'
    ),
});

export const connectorFieldOptionSchema = z.object({
  value: z.string().describe('Configuration value to use for the requested parameter.'),
  label: z.string().describe('Display label for this configuration value.'),
});
