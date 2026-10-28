import { z } from 'zod';
import { DataStorageType } from '../model/types';
import { RedshiftConnectionType } from '../model/types/data-storage-config';

const googleConfigSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  location: z.string().min(1, 'Location is required'),
});

/**
 * Same rule as the backend's BigQueryConfigSchema: 6-30 lowercase letters, digits or hyphens,
 * starting with a letter and not ending with a hyphen, optionally domain-scoped
 * (`example.com:my-project`). Checked here so the field is highlighted before the request
 * instead of the save failing with a toast. Users most often paste the project NAME, which the
 * message calls out.
 *
 * Keep in step with apps/backend/src/data-marts/data-storage-types/bigquery/schemas/
 * bigquery-config.schema.ts: both specs run the same accept/reject table.
 */
const GCP_PROJECT_ID_PATTERN = /^(?:[a-z][a-z0-9.-]*:)?[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

// Only the editable BigQuery storage checks the format: the legacy one shows its stored
// Project ID read-only, so a format error there would block saving with nothing to fix.
const googleBigQueryConfigSchema = googleConfigSchema.extend({
  projectId: z
    .string()
    .trim()
    .min(1, 'Project ID is required')
    .regex(
      GCP_PROJECT_ID_PATTERN,
      'Use the Project ID, not the project name: 6–30 lowercase letters, digits, or hyphens, starting with a letter and not ending with a hyphen (e.g. my-project-123)'
    ),
});

const awsConfigSchema = z.object({
  region: z.string().min(1, 'Region is required'),
  outputBucket: z.string().min(1, 'Output Bucket is required'),
});

const snowflakeConfigSchema = z.object({
  account: z.string().min(1, 'Account is required'),
  warehouse: z.string().min(1, 'Warehouse is required'),
});

const redshiftServerlessConfigSchema = z.object({
  connectionType: z.literal(RedshiftConnectionType.SERVERLESS),
  region: z.string().min(1, 'Region is required'),
  database: z.string().min(1, 'Database is required'),
  workgroupName: z.string().min(1, 'Workgroup Name is required'),
});

const redshiftProvisionedConfigSchema = z.object({
  connectionType: z.literal(RedshiftConnectionType.PROVISIONED),
  region: z.string().min(1, 'Region is required'),
  database: z.string().min(1, 'Database is required'),
  clusterIdentifier: z.string().min(1, 'Cluster Identifier is required'),
});

const redshiftConfigSchema = z.discriminatedUnion('connectionType', [
  redshiftServerlessConfigSchema,
  redshiftProvisionedConfigSchema,
]);

const databricksConfigSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  httpPath: z.string().min(1, 'HTTP Path is required'),
});

const baseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be 255 characters or less'),
  reusableCredentialId: z.string().min(1, 'Select a Credential'),
});

export const googleBigQuerySchema = baseSchema.extend({
  type: z.literal(DataStorageType.GOOGLE_BIGQUERY),
  config: googleBigQueryConfigSchema,
});

export const legacyGoogleBigQuerySchema = baseSchema.extend({
  type: z.literal(DataStorageType.LEGACY_GOOGLE_BIGQUERY),
  config: googleConfigSchema,
});

export const awsAthenaSchema = baseSchema.extend({
  type: z.literal(DataStorageType.AWS_ATHENA),
  config: awsConfigSchema,
});

export const snowflakeSchema = baseSchema.extend({
  type: z.literal(DataStorageType.SNOWFLAKE),
  config: snowflakeConfigSchema,
});

export const redshiftSchema = baseSchema.extend({
  type: z.literal(DataStorageType.AWS_REDSHIFT),
  config: redshiftConfigSchema,
});

export const databricksSchema = baseSchema.extend({
  type: z.literal(DataStorageType.DATABRICKS),
  config: databricksConfigSchema,
});

export const dataStorageSchema = z.discriminatedUnion('type', [
  googleBigQuerySchema,
  legacyGoogleBigQuerySchema,
  awsAthenaSchema,
  snowflakeSchema,
  redshiftSchema,
  databricksSchema,
]);

export type DataStorageFormData = z.infer<typeof dataStorageSchema>;
export type GoogleBigQueryFormData = z.infer<typeof googleBigQuerySchema>;
export type LegacyGoogleBigQueryFormData = z.infer<typeof legacyGoogleBigQuerySchema>;
export type AwsAthenaFormData = z.infer<typeof awsAthenaSchema>;
export type SnowflakeFormData = z.infer<typeof snowflakeSchema>;
export type RedshiftFormData = z.infer<typeof redshiftSchema>;
export type DatabricksFormData = z.infer<typeof databricksSchema>;
