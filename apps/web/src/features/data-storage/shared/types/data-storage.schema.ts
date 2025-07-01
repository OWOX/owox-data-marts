import { z } from 'zod';
import { DataStorageType } from '../model/types';
import { googleServiceAccountSchema } from '../../../../shared';

const awsCredentialsSchema = z.object({
  accessKeyId: z.string().min(1, 'Access Key ID is required'),
  secretAccessKey: z.string().min(1, 'Secret Access Key is required'),
});

const googleConfigSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  location: z.string().min(1, 'Location is required'),
});

const awsConfigSchema = z.object({
  region: z.string().min(1, 'Region is required'),
  outputBucket: z.string().min(1, 'Output Bucket is required'),
  databaseName: z.string().min(1, 'Database Name is required'),
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

export const dataStorageSchema = z.discriminatedUnion('type', [
  googleBigQuerySchema,
  awsAthenaSchema,
]);

export type DataStorageFormData = z.infer<typeof dataStorageSchema>;
export type GoogleBigQueryFormData = z.infer<typeof googleBigQuerySchema>;
export type AwsAthenaFormData = z.infer<typeof awsAthenaSchema>;
