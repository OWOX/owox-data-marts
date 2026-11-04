import { BigQueryConfigSchema } from '../../../../data-marts/data-storage-types/bigquery/schemas/bigquery-config.schema';
import { AthenaConfigSchema } from '../../../../data-marts/data-storage-types/athena/schemas/athena-config.schema';
import { SnowflakeConfigSchema } from '../../../../data-marts/data-storage-types/snowflake/schemas/snowflake-config.schema';
import {
  RedshiftProvisionedConfigSchema,
  RedshiftServerlessConfigSchema,
} from '../../../../data-marts/data-storage-types/redshift/schemas/redshift-config.schema';
import { DatabricksWorkspaceConfigSchema } from '../../../../data-marts/data-storage-types/databricks/schemas/databricks-config.schema';
import { z } from 'zod';
import { DataStorageType } from '../../../../data-marts/data-storage-types/enums/data-storage-type.enum';
import { OwnerFilter } from '../../../../data-marts/enums/owner-filter.enum';

const storageId = z.string().min(1).describe('Storage ID from list_storages or create_storage.');
const title = z.string().trim().min(1).max(255);
export const storageTypeSchema = z.enum(DataStorageType);
export const storageConfigurationSchema = z.union([
  BigQueryConfigSchema.extend({
    location: BigQueryConfigSchema.shape.location.pipe(z.string()),
  }).strict(),
  AthenaConfigSchema.strict(),
  SnowflakeConfigSchema.strict(),
  RedshiftProvisionedConfigSchema.strict(),
  RedshiftServerlessConfigSchema.strict(),
  DatabricksWorkspaceConfigSchema.strict(),
]);

export const storageTargetSchema = z.object({ storage_id: storageId }).strict();
export const listStoragesSchema = z
  .object({
    storage_type: storageTypeSchema.optional(),
    owner_id: z
      .string()
      .min(1)
      .optional()
      .describe('Return Storages owned by this project member.'),
    owner_filter: z.enum(OwnerFilter).optional(),
  })
  .strict();
export const createStorageSchema = z
  .object({
    storage_type: z.enum([
      DataStorageType.GOOGLE_BIGQUERY,
      DataStorageType.AWS_ATHENA,
      DataStorageType.SNOWFLAKE,
      DataStorageType.AWS_REDSHIFT,
      DataStorageType.DATABRICKS,
    ]),
    title: title.optional(),
  })
  .strict();
export const updateStorageSchema = z
  .object({
    storage_id: storageId,
    title: title.optional(),
    configuration: storageConfigurationSchema
      .optional()
      .describe(
        'Complete non-secret configuration for this Storage type. Omit to keep the saved configuration.'
      ),
    credential_id: z
      .string()
      .min(1)
      .optional()
      .describe('Compatible saved Credential ID. Omit to keep the current Credential.'),
  })
  .strict()
  .refine(
    input =>
      input.title !== undefined ||
      input.configuration !== undefined ||
      input.credential_id !== undefined,
    { message: 'Supply a title, configuration, or credential_id.' }
  );
export const setStorageAccessSchema = z
  .object({
    storage_id: storageId,
    owner_ids: z
      .array(z.string().min(1))
      .max(1000)
      .optional()
      .describe(
        'Replacement owner IDs from list_project_members. An empty list removes all owners.'
      ),
    context_ids: z
      .array(z.string().min(1))
      .max(1000)
      .optional()
      .describe('Replacement Context IDs from list_contexts. An empty list removes all Contexts.'),
    available_for_use: z.boolean().optional(),
    available_for_maintenance: z.boolean().optional(),
  })
  .strict()
  .refine(
    input =>
      input.owner_ids !== undefined ||
      input.context_ids !== undefined ||
      input.available_for_use !== undefined ||
      input.available_for_maintenance !== undefined,
    { message: 'Supply at least one access setting.' }
  );
export const listStorageResourcesSchema = z
  .object({
    storage_id: storageId,
    level: z
      .enum(['namespaces', 'resources'])
      .describe('List BigQuery projects or resources within a project.'),
    namespace_id: z
      .string()
      .min(1)
      .optional()
      .describe('BigQuery project ID from the namespaces result. Required for resources.'),
    resource_type: z.enum(['TABLE', 'VIEW', 'TABLE_PATTERN']).optional(),
  })
  .strict()
  .refine(input => input.level !== 'resources' || input.namespace_id !== undefined, {
    message: 'Supply namespace_id to list resources.',
  });

const credentialState = z.enum([
  'ready',
  'disabled',
  'not-configured',
  'reconnect-required',
  'reauthorize-required',
  'deleted',
  'unavailable',
]);
const credential = z.discriminatedUnion('access', [
  z.object({
    access: z.literal('visible'),
    credential_id: z.string(),
    title: z.string(),
    definition_id: z.string(),
    provider_name: z.string(),
    identity: z.string().nullable(),
    state: credentialState,
  }),
  z.object({ access: z.literal('restricted'), state: credentialState }),
  z.object({ access: z.literal('pending'), state: z.literal('ready') }),
]);
export const storageSummaryOutputSchema = {
  storage_id: z.string(),
  title: z.string(),
  storage_type: storageTypeSchema,
  created_at: z.string(),
  modified_at: z.string(),
};
export const storageOutputSchema = {
  storage_id: z.string(),
  title: z.string(),
  storage_type: storageTypeSchema,
  configuration: storageConfigurationSchema.nullable(),
  credential: credential.nullable(),
  owners: z.array(
    z.object({ user_id: z.string(), name: z.string().nullable(), email: z.string().nullable() })
  ),
  contexts: z.array(
    z.object({ context_id: z.string(), name: z.string(), icon: z.string().nullable() })
  ),
  available_for_use: z.boolean(),
  available_for_maintenance: z.boolean(),
  created_at: z.string(),
  modified_at: z.string(),
};
export const storageValidationOutputSchema = {
  storage_id: z.string(),
  valid: z.boolean(),
  state: z.enum([
    'valid',
    'unconfigured',
    'invalid_configuration',
    'reauthorization_required',
    'credential_unavailable',
    'validation_failed',
  ]),
  message: z.string(),
};
export const storageResourcesOutputSchema = {
  storage_id: z.string(),
  namespaces: z.array(z.object({ id: z.string(), label: z.string().optional() })).optional(),
  resources: z
    .array(
      z.object({
        id: z.string(),
        group_id: z.string(),
        type: z.enum(['TABLE', 'VIEW']),
        fully_qualified_name: z.string(),
        location: z.string().optional(),
        location_mismatch: z.boolean().optional(),
      })
    )
    .optional(),
};
