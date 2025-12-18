import { z } from 'zod';
import { RedshiftConnectionType } from '../enums/redshift-connection-type.enum';

export const RedshiftServerlessConfigSchema = z.object({
  connectionType: z.literal(RedshiftConnectionType.SERVERLESS),
  region: z.string().min(1, 'region is required'),
  database: z.string().min(1, 'database is required'),
  workgroupName: z.string().min(1, 'workgroupName is required for Serverless'),
});

export const RedshiftProvisionedConfigSchema = z.object({
  connectionType: z.literal(RedshiftConnectionType.PROVISIONED),
  region: z.string().min(1, 'region is required'),
  database: z.string().min(1, 'database is required'),
  clusterIdentifier: z.string().min(1, 'clusterIdentifier is required for Provisioned'),
});

export const RedshiftConfigSchema = z.discriminatedUnion('connectionType', [
  RedshiftServerlessConfigSchema,
  RedshiftProvisionedConfigSchema,
]);

export type RedshiftServerlessConfig = z.infer<typeof RedshiftServerlessConfigSchema>;
export type RedshiftProvisionedConfig = z.infer<typeof RedshiftProvisionedConfigSchema>;
export type RedshiftConfig = z.infer<typeof RedshiftConfigSchema>;
