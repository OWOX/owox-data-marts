import { z } from 'zod';

export const DatabricksConfigSchema = z.object({
  host: z.string().min(1),
  httpPath: z.string().min(1),
});

export type DatabricksConfig = z.infer<typeof DatabricksConfigSchema>;

/** Workspace domains on AWS (commercial, GovCloud, DoD), GCP and Azure (global, Government, China). */
const WORKSPACE_DOMAINS = [
  'cloud.databricks.com',
  'cloud.databricks.us',
  'cloud.databricks.mil',
  'gcp.databricks.com',
  'azuredatabricks.net',
  'databricks.azure.us',
  'databricks.azure.cn',
] as const;

export function isDatabricksWorkspaceHost(host: string): boolean {
  const name = host.toLowerCase();
  return (
    /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name) &&
    WORKSPACE_DOMAINS.some(domain => name.endsWith(`.${domain}`))
  );
}

/**
 * The config a token is checked against or saved with: the token goes to `host`, so a member who
 * may only use a Credential must not point it elsewhere. Runs keep the plain schema.
 */
export const DatabricksWorkspaceConfigSchema = DatabricksConfigSchema.extend({
  host: DatabricksConfigSchema.shape.host.refine(isDatabricksWorkspaceHost, {
    message:
      'Enter the host of a Databricks workspace, like adb-1234567890123456.7.azuredatabricks.net.',
  }),
});
