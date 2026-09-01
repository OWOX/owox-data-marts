import { z } from 'zod';

export const CredentialDefinitionSourceSchema = z.enum(['builtin', 'external']);
export type CredentialDefinitionSource = z.infer<typeof CredentialDefinitionSourceSchema>;

export const CredentialValidationStateSchema = z.enum(['unknown', 'verified', 'rejected']);
export type CredentialValidationState = z.infer<typeof CredentialValidationStateSchema>;

export interface CredentialValidationResult {
  readonly state: CredentialValidationState;
  readonly message: string;
  readonly validatedAt: Date;
}

export const CredentialAiAdapterSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'openai-compatible',
]);
export type CredentialAiAdapter = z.infer<typeof CredentialAiAdapterSchema>;

/**
 * Browser-facing documentation metadata, not a server-side network target.
 *
 * Keep the same boundary as the web app's safeHttpsUrl helper: only a parseable,
 * absolute HTTPS URL is exposed. Embedded credentials are additionally refused so
 * the visible host cannot conceal user-info in a generated link. Normalising here
 * gives built-in and external definitions one stable outward representation.
 */
export const CredentialDocumentationUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'documentationUrl must be an absolute HTTPS URL without embedded credentials')
  .transform(value => new URL(value).href);

export const CredentialDefinitionContractSchema = z.object({
  id: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).default(''),
  documentationUrl: CredentialDocumentationUrlSchema.optional(),
  auth: z.object({
    type: z.literal('header'),
    label: z.string().trim().min(1).max(255),
    headerName: z.string().trim().min(1).max(255),
    prefix: z.string().max(64).optional(),
  }),
  origins: z.array(z.string().url().startsWith('https://')).min(1).max(20),
  validation: z
    .object({
      method: z.enum(['GET', 'POST']).default('GET'),
      path: z.string().startsWith('/').max(2048),
      headers: z.record(z.string()).optional(),
      successStatuses: z.array(z.number().int().min(200).max(399)).min(1).max(20).optional(),
      rejectedStatuses: z.array(z.number().int().min(400).max(499)).min(1).max(20).optional(),
    })
    .optional(),
  ai: z
    .object({
      adapter: CredentialAiAdapterSchema,
      baseUrl: z.string().url().startsWith('https://'),
      models: z
        .object({
          language: z
            .array(z.object({ id: z.string().min(1), name: z.string().min(1) }))
            .max(100)
            .default([]),
          embedding: z
            .array(z.object({ id: z.string().min(1), name: z.string().min(1) }))
            .max(100)
            .default([]),
        })
        .optional(),
      recommended: z
        .object({
          fast: z.string().min(1).optional(),
          reasoning: z.string().min(1).optional(),
          embedding: z.string().min(1).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type CredentialDefinitionContract = z.infer<typeof CredentialDefinitionContractSchema>;

export const CredentialRequirementSchema = z.union([
  z.string().trim().min(1).max(255),
  z.object({
    id: z.string().trim().min(1).max(255),
    optional: z.boolean().default(false),
    models: z.array(z.string().trim().min(1).max(255)).max(20).optional(),
  }),
]);

export type CredentialRequirement = z.infer<typeof CredentialRequirementSchema>;

/** Trusted, release-time resolution of an external GitHub locator. */
export interface ResolvedExternalCredentialRequirement {
  readonly id: string;
  readonly definitionId: string;
  readonly optional: boolean;
  readonly models?: readonly string[];
}

export type StoredCredentialRequirement =
  | CredentialRequirement
  | ResolvedExternalCredentialRequirement;

export interface NormalizedCredentialRequirement {
  readonly key: string;
  readonly definitionId: string | null;
  readonly optional: boolean;
  readonly models: readonly string[];
}

export function normalizeCredentialRequirement(
  requirement: StoredCredentialRequirement
): NormalizedCredentialRequirement {
  if (typeof requirement === 'string') {
    if (requirement === 'ai') {
      return {
        key: 'ai',
        definitionId: null,
        optional: false,
        models: ['fast'],
      };
    }
    return {
      key: requirement,
      definitionId: requirement,
      optional: false,
      models: [],
    };
  }

  return {
    key: requirement.id,
    definitionId:
      'definitionId' in requirement
        ? requirement.definitionId
        : requirement.id === 'ai'
          ? null
          : requirement.id,
    optional: requirement.optional,
    models: [
      ...(requirement.id === 'ai' ? (requirement.models ?? ['fast']) : (requirement.models ?? [])),
    ].sort(),
  };
}

export interface CredentialSecret {
  readonly value: string;
}

export type CredentialAiModelMappings = Record<string, string>;
export type CredentialAiModelMappingModes = Record<string, 'recommended' | 'override'>;
export type CredentialAiModelMappingSources = Record<string, 'catalog' | 'manual'>;

export function isCredentialAiModelInCatalog(
  ai: NonNullable<CredentialDefinitionContract['ai']>,
  capability: string,
  modelId: string
): boolean {
  const catalog = capability === 'embedding' ? ai.models?.embedding : ai.models?.language;
  return Boolean(catalog?.some(model => model.id === modelId));
}

export function resolveCredentialAiModelMappings(
  stored: CredentialAiModelMappings | null,
  modes: CredentialAiModelMappingModes | null,
  recommended: Partial<CredentialAiModelMappings> | undefined
): CredentialAiModelMappings | null {
  if (!stored && !modes) return null;
  const keys = new Set([...Object.keys(stored ?? {}), ...Object.keys(modes ?? {})]);
  const resolved: CredentialAiModelMappings = {};
  for (const key of keys) {
    const value = modes?.[key] === 'recommended' ? recommended?.[key] : stored?.[key];
    if (value?.trim()) resolved[key] = value;
  }
  return Object.keys(resolved).length > 0 ? resolved : null;
}

export const CREDENTIAL_CONSUMER_TYPE_PLUGIN_INSTALLATION = 'plugin-installation' as const;
export type CredentialConsumerType = typeof CREDENTIAL_CONSUMER_TYPE_PLUGIN_INSTALLATION;
