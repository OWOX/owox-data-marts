import { z } from 'zod';
import { DataStorageType } from '../model/types';
import { googleServiceAccountSchema } from '../../../../shared';
import { SnowflakeAuthMethod } from '../model/types/credentials';

const awsCredentialsSchema = z.object({
  accessKeyId: z.string().min(1, 'Access Key ID is required'),
  secretAccessKey: z.string().min(1, 'Secret Access Key is required'),
});

const snowflakePasswordCredentialsSchema = z.object({
  authMethod: z.literal(SnowflakeAuthMethod.PASSWORD),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const snowflakeKeyPairCredentialsSchema = z.object({
  authMethod: z.literal(SnowflakeAuthMethod.KEY_PAIR),
  username: z.string().min(1, 'Username is required'),
  privateKey: z.string().min(1, 'Private Key is required'),
  privateKeyPassphrase: z.string().optional(),
});

const snowflakeCredentialsSchema = z.discriminatedUnion('authMethod', [
  snowflakePasswordCredentialsSchema,
  snowflakeKeyPairCredentialsSchema,
]);

const googleConfigSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  location: z.string().min(1, 'Location is required'),
});

const awsConfigSchema = z.object({
  region: z.string().min(1, 'Region is required'),
  outputBucket: z.string().min(1, 'Output Bucket is required'),
});

const snowflakeConfigSchema = z.object({
  account: z.string().min(1, 'Account is required'),
  warehouse: z.string().min(1, 'Warehouse is required'),
});

const baseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be 255 characters or less'),
});

export const googleBigQuerySchema = baseSchema.extend({
  type: z.literal(DataStorageType.GOOGLE_BIGQUERY),
  credentials: googleServiceAccountSchema,
  config: googleConfigSchema,
});

export const awsAthenaSchema = baseSchema.extend({
  type: z.literal(DataStorageType.AWS_ATHENA),
  credentials: awsCredentialsSchema,
  config: awsConfigSchema,
});

export const snowflakeSchema = baseSchema.extend({
  type: z.literal(DataStorageType.SNOWFLAKE),
  credentials: snowflakeCredentialsSchema,
  config: snowflakeConfigSchema,
});

export const dataStorageSchema = z.discriminatedUnion('type', [
  googleBigQuerySchema,
  awsAthenaSchema,
  snowflakeSchema,
]);

export type DataStorageFormData = z.infer<typeof dataStorageSchema>;
export type GoogleBigQueryFormData = z.infer<typeof googleBigQuerySchema>;
export type AwsAthenaFormData = z.infer<typeof awsAthenaSchema>;
export type SnowflakeFormData = z.infer<typeof snowflakeSchema>;
