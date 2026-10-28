import { maxCodePointLength } from '../../../../common/validators/max-code-point-length.validator';
import { z } from 'zod-v4';
import {
  MAX_MANIFEST_SIZE_BYTES,
  MAX_TEXT_COLUMN_BYTES,
  MAX_VARCHAR_LENGTH,
} from '../../../../data-marts/facades/mcp-custom-connectors.facade';

export const connectorIdSchema = z
  .string()
  .min(1)
  .describe('Use the ID from list_custom_connectors or create_custom_connector.');
export const versionSchema = z
  .number()
  .int()
  .positive()
  .describe('Use a version number returned by get_custom_connector.');
export const connectorTargetSchema = z.object({ connector_id: connectorIdSchema }).strict();
export const connectorVersionTargetSchema = connectorTargetSchema.extend({
  version: versionSchema,
});
export const connectorPublishedSchema = connectorTargetSchema.extend({
  version: versionSchema
    .optional()
    .describe(
      'Specify a published version number. Omit version to use the active published version. Draft versions are not available through this tool.'
    ),
});

const varcharSchema = z
  .string()
  .refine(value => maxCodePointLength(value, MAX_VARCHAR_LENGTH), 'Must not exceed 255 characters');
const textSchema = z
  .string()
  .refine(
    value => Buffer.byteLength(value, 'utf8') <= MAX_TEXT_COLUMN_BYTES,
    'Must not exceed 65535 UTF-8 bytes'
  );
const titleSchema = varcharSchema.refine(value => value.length > 0, 'Must not be empty');
export const connectorMetadataShape = {
  title: titleSchema.optional(),
  description: textSchema.nullable().optional(),
  logo: textSchema.nullable().optional(),
  doc_url: varcharSchema.nullable().optional(),
};

export const jsonObjectSchema = z.record(z.string(), z.unknown());
export const boundedJsonObjectSchema = jsonObjectSchema.refine(
  value => Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_MANIFEST_SIZE_BYTES,
  'Must not exceed 120 KiB of JSON'
);
export const manifestSchema = boundedJsonObjectSchema.describe(
  'Supply the complete declarative connector manifest. Follow https://docs.owox.com/docs/connectors/manifest-reference.llms.txt. Use parameter references for credentials instead of literal secrets. Drafts may be incomplete. Publishing validates the full manifest.'
);
export const createConnectorSchema = z
  .object({
    ...connectorMetadataShape,
    name: titleSchema.describe(
      'Use a name that is unique in this project and differs from all bundled connector names. The name cannot change.'
    ),
    title: titleSchema,
    manifest: manifestSchema,
  })
  .strict();
export const updateConnectorSchema = connectorTargetSchema.extend(connectorMetadataShape);
export const saveDraftSchema = connectorTargetSchema.extend({ manifest: manifestSchema });
export const testConnectorSchema = z
  .object({
    manifest: manifestSchema,
    node: z.string().min(1).describe('Specify the node key from manifest.nodes to test.'),
    configuration: boundedJsonObjectSchema.describe(
      'Supply a flat map of parameter names to values for this test. The configuration is not saved. Mark credential parameters with attributes: ["SECRET"] in the manifest.'
    ),
    max_rows: z.number().int().min(1).max(1000).optional(),
    max_pages: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export const connectorCreatedOutputSchema = {
  connector_id: z.string(),
  name: z.string(),
  title: z.string(),
};
export const connectorOutputSchema = {
  ...connectorCreatedOutputSchema,
  description: z.string().nullable(),
  doc_url: z.string().nullable(),
  active_version_id: z.string().nullable(),
  active_version: z.number().int().nullable(),
};
export const versionStateOutputSchema = {
  version: z.number().int(),
  status: z.enum(['draft', 'published']),
};
export const connectorDetailOutputSchema = {
  ...connectorOutputSchema,
  versions: z.array(z.object({ ...versionStateOutputSchema, published_at: z.string().nullable() })),
};
export const connectorPublishedOutputSchema = {
  ...versionStateOutputSchema,
  published_at: z.string().nullable(),
  warnings: z.array(z.string()),
};
export const connectorActivatedOutputSchema = {
  active_version_id: z.string().nullable(),
  active_version: z.number().int(),
};
export const connectorTestOutputSchema = {
  rows: z.array(jsonObjectSchema),
  logs: z
    .array(z.string())
    .describe(
      'The result contains up to 50 recent log entries plus an omission notice. Each entry has at most 2000 characters. The total limit is 8000 characters, including the notice. Notices identify omitted or shortened log content.'
    ),
  error: z.string().nullable(),
  sample: z.array(jsonObjectSchema),
};

const specificationItemSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  default: z.unknown().optional(),
  requiredType: z
    .enum(['string', 'number', 'boolean', 'bool', 'object', 'array', 'date'])
    .optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
  minimum: z.number().optional(),
  attributes: z.array(z.string()).optional(),
  optionsDependsOn: z.array(z.string()).optional(),
});
export const specificationOutputSchema = {
  specification: z.array(
    specificationItemSchema.extend({
      oneOf: z
        .array(
          z.object({
            label: z.string(),
            value: z.string(),
            requiredType: specificationItemSchema.shape.requiredType,
            attributes: z.array(z.string()).optional(),
            items: z.record(z.string(), specificationItemSchema),
          })
        )
        .optional(),
    })
  ),
};
export const fieldsOutputSchema = {
  fields: z.array(
    z.object({
      name: z.string(),
      overview: z.string().optional(),
      description: z.string().optional(),
      documentation: z.string().optional(),
      uniqueKeys: z.array(z.string()).optional(),
      uniqueKeysByDataLevel: z.record(z.string(), z.array(z.string())).optional(),
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
  ),
};
