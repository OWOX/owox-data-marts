import { z } from 'zod-v4';

export const pluginReferenceInput = z.object({ pluginId: z.string().uuid() }).strict();
export const emptyPluginInput = z.object({}).strict();

export const pluginSummarySchema = z
  .object({
    pluginId: z.string(),
    displayName: z.string(),
    description: z.string(),
    currentVersionId: z.string().nullable(),
    currentSemver: z.string().nullable(),
    installationState: z.enum(['not_installed', 'installed', 'uninstalled']),
    suspended: z.boolean(),
    detailsUrl: z.string().url(),
  })
  .strict();

export const pluginConfigurationSchema = z
  .object({
    pluginId: z.string(),
    mode: z.literal('app'),
    verification: z.literal('unknown'),
    appUrl: z.string().url(),
    manualStep: z.string(),
  })
  .strict();

export const pluginSetupSchema = z
  .object({
    plugin: pluginSummarySchema,
    installation: z
      .object({
        installationId: z.string(),
        revision: z.number().int().nonnegative(),
        installedAt: z.string(),
        uninstalledAt: z.string().nullable(),
      })
      .strict()
      .nullable(),
    requirements: z.array(
      z
        .object({
          key: z.string(),
          definitionId: z.string().nullable(),
          optional: z.boolean(),
          models: z.array(z.string()),
          scopes: z.array(z.string()),
        })
        .strict()
    ),
    credentials: z
      .object({
        configured: z.boolean(),
        providerValidity: z.literal('unknown'),
        requirements: z.array(
          z
            .object({
              key: z.string(),
              optional: z.boolean(),
              state: z.enum(['configured', 'missing', 'inaccessible', 'incompatible']),
            })
            .strict()
        ),
      })
      .strict()
      .nullable(),
    readiness: z.enum([
      'not_installed',
      'uninstalled',
      'suspended',
      'version_unavailable',
      'credentials_required',
      'configuration_unverified',
    ]),
    configuration: pluginConfigurationSchema,
    approval: z
      .object({ status: z.enum(['required_in_app', 'completed']), appUrl: z.string().url() })
      .strict(),
  })
  .strict();

export const pluginUpdateSchema = z
  .object({
    pluginId: z.string(),
    currentVersionId: z.string().nullable(),
    currentSemver: z.string().nullable(),
    outcome: z.enum(['updated', 'up_to_date', 'already_running', 'failed']),
    nextCheckAt: z.string().nullable(),
    sharedDeploymentEffect: z.literal(true),
    effect: z.string(),
  })
  .strict();

export const pluginMutationInput = z
  .object({
    pluginId: z.string().uuid(),
    operationId: z.string().trim().min(1).max(255),
    expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    expectedVersionId: z.string().uuid(),
    approvalId: z.string().uuid().optional(),
  })
  .strict();
export const pluginUninstallInput = pluginMutationInput.omit({
  expectedVersionId: true,
  approvalId: true,
});
export const pluginMutationSchema = z
  .object({
    state: z.enum(['app_required', 'completed', 'incomplete']),
    pluginId: z.string(),
    installationId: z.string().nullable(),
    revision: z.number().int().nonnegative(),
    approvalId: z.string().nullable(),
    appUrl: z.string().url().nullable(),
  })
  .strict();
