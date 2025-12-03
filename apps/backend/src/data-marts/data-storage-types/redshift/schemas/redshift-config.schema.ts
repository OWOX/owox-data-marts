import { z } from 'zod';
import { RedshiftConnectionType } from '../enums/redshift-connection-type.enum';

export const RedshiftServerlessConfigSchema = z.object({
  connectionType: z.literal(RedshiftConnectionType.SERVERLESS),
  region: z.string().min(1, 'region is required'),
  database: z.string().min(1, 'database is required'),
  workgroupName: z.string().min(1, 'workgroupName is required for Serverless'),
  // schema removed - now managed in connector setup
});

export const RedshiftProvisionedConfigSchema = z.object({
  connectionType: z.literal(RedshiftConnectionType.PROVISIONED),
  region: z.string().min(1, 'region is required'),
  database: z.string().min(1, 'database is required'),
  clusterIdentifier: z.string().min(1, 'clusterIdentifier is required for Provisioned'),
  // schema removed - now managed in connector setup
});

// Primary schema using discriminated union
export const RedshiftConfigSchema = z.discriminatedUnion('connectionType', [
  RedshiftServerlessConfigSchema,
  RedshiftProvisionedConfigSchema,
]);

// Legacy schema for backward compatibility (when connectionType is missing)
export const RedshiftLegacyConfigSchema = z
  .object({
    region: z.string().min(1, 'region is required'),
    database: z.string().min(1, 'database is required'),
    workgroupName: z.string().optional(),
    clusterIdentifier: z.string().optional(),
    schema: z.string().optional(),
  })
  .refine(data => !!(data.workgroupName || data.clusterIdentifier), {
    message:
      'Either workgroupName (Serverless) or clusterIdentifier (Provisioned) must be provided',
    path: ['workgroupName'],
  })
  .refine(data => !(data.workgroupName && data.clusterIdentifier), {
    message: 'Cannot specify both workgroupName and clusterIdentifier',
    path: ['clusterIdentifier'],
  });

// Union to accept both new and legacy formats
export const RedshiftConfigSchemaWithLegacy = z.union([
  RedshiftConfigSchema,
  RedshiftLegacyConfigSchema,
]);

export type RedshiftServerlessConfig = z.infer<typeof RedshiftServerlessConfigSchema>;
export type RedshiftProvisionedConfig = z.infer<typeof RedshiftProvisionedConfigSchema>;
export type RedshiftConfig = z.infer<typeof RedshiftConfigSchema>;
export type RedshiftLegacyConfig = z.infer<typeof RedshiftLegacyConfigSchema>;
