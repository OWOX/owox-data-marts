import { maxCodePointLength } from '../../../../common/validators/max-code-point-length.validator';
import { z } from 'zod';
import { mcpManifestKeyPaths } from '../../observability/mcp-telemetry-redaction';
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
export const manifestSchema = boundedJsonObjectSchema
  .superRefine((manifest, ctx) => {
    const paths = mcpManifestKeyPaths(manifest);
    if (paths.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `Remove the keys at ${paths.join(', ')}. Keys go only through Credentials: reference a parameter with attributes: ["SECRET"] and select a saved Credential when you test the draft.`,
      });
    }
  })
  .describe(
    'Supply the complete declarative connector manifest. Follow https://docs.owox.com/docs/connectors/manifest-reference.llms.txt. Keys go only through Credentials: the tool rejects a literal key or a [REDACTED] value. Declare each key as a parameter with attributes: ["SECRET"] and use parameter references. Drafts may be incomplete. Publishing validates the full manifest.'
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
export const testConnectorSchema = connectorTargetSchema
  .extend({
    node: z.string().min(1).describe('Specify the node key from the draft manifest.nodes to test.'),
    configuration: boundedJsonObjectSchema.describe(
      'Supply a flat map of non-secret parameter names to values. Do not supply keys. The tool rejects a parameter that the manifest marks with attributes: ["SECRET"], uses in authentication, or sends in a credential header or query parameter. With credential_id, omit fields supplied by that Credential. The test does not save this configuration.'
    ),
    credential_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Select a saved custom connector Credential that you can use. It supplies the keys. Its hosts and fields must fit the manifest. Omit its fields from configuration. Omit this ID only if the API needs no keys. To save keys, call start_credential_setup.'
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
const stoppingOutputSchema = {
  stopping_data_marts: z
    .array(z.object({ id: z.string(), title: z.string() }))
    .describe(
      'Data Marts that stop until someone selects a fitting Credential; may be a partial list.'
    ),
  hidden_stopping_count: z
    .number()
    .int()
    .describe('How many more stopping Data Marts the list leaves out.'),
};
export const connectorPublishedOutputSchema = {
  ...versionStateOutputSchema,
  published_at: z.string().nullable(),
  warnings: z.array(z.string()),
  ...stoppingOutputSchema,
};
export const connectorActivatedOutputSchema = {
  active_version_id: z.string().nullable(),
  active_version: z.number().int(),
  ...stoppingOutputSchema,
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
      isFetchedByDate: z.boolean().optional(),
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
