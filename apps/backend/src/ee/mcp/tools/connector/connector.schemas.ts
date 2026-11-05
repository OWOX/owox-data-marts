import { z } from 'zod';

export {
  fieldsOutputSchema,
  specificationOutputSchema,
} from '../custom-connector/custom-connector.schemas';

export const connectorTargetSchema = z
  .object({
    connector_name: z
      .string()
      .min(1)
      .max(255)
      .describe('Use the exact name returned by list_connectors.'),
  })
  .strict();
export const connectorPreviewSchema = connectorTargetSchema.extend({
  data_mart_id: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(
      'Use the Data Mart that binds this Credential. With configuration_id, its editors can preview that bound configuration under the same permissions as the web app.'
    ),
  configuration_id: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(
      'Use the saved configuration ID within data_mart_id only with its matching saved credential_id. No saved configuration or secrets are copied.'
    ),
  credential_id: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(
      'Select a saved Credential that you can use. Omit credential_id for sources that need no authentication.'
    ),
  configuration: z
    .record(z.string(), z.json())
    .refine(
      value => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 120 * 1024,
      'Configuration must not exceed 120 KiB of JSON.'
    )
    .describe(
      'Supply only declared non-secret connector parameters. Omit credential fields, internal IDs, and old secret references. Supply credential_id separately.'
    ),
});
export const connectorFieldOptionsPreviewSchema = connectorPreviewSchema.extend({
  field: z
    .string()
    .min(1)
    .max(128)
    .describe('Use a parameter with the DYNAMIC_OPTIONS attribute in get_connector_specification.'),
});
