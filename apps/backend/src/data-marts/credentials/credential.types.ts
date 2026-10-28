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

/** The provider a definition belongs to; 'ai' groups the AI providers a member picks from. */
export const CredentialCategorySchema = z.enum([
  'google',
  'aws',
  'snowflake',
  'databricks',
  'ai',
  'other',
]);
export type CredentialCategory = z.infer<typeof CredentialCategorySchema>;

export const CredentialIconSchema = z.enum([
  'google',
  'aws',
  'snowflake',
  'databricks',
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
  'github',
]);
export type CredentialIcon = z.infer<typeof CredentialIconSchema>;

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

const CredentialHeaderAuthSchema = z.object({
  type: z.literal('header'),
  label: z.string().trim().min(1).max(255),
  headerName: z.string().trim().min(1).max(255),
  prefix: z.string().max(64).optional(),
});

/** OWOX signs a token request with the stored key and adds the access token itself. */
const CredentialGoogleServiceAccountAuthSchema = z.object({
  type: z.literal('google-service-account'),
  label: z.string().trim().min(1).max(255),
});

export interface CredentialFieldDefinition {
  readonly key: string;
  readonly label: string;
  readonly input: 'text' | 'password' | 'multiline';
  readonly secret: boolean;
  readonly required: boolean;
  readonly identity: boolean;
}

const CredentialFieldSchema = z.object({
  key: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9]{0,63}$/, 'field key must be alphanumeric and start with a letter'),
  label: z.string().trim().min(1).max(255),
  input: z.enum(['text', 'password', 'multiline']),
  secret: z.boolean(),
  required: z.boolean(),
  identity: z.boolean(),
});

/** The Credential holds an ordered set of named values; secret ones are write-only. */
const CredentialFieldsAuthSchema = z.object({
  type: z.literal('fields'),
  fields: z.array(CredentialFieldSchema).min(1).max(20),
});

/** A configured Google OAuth app, by its env key: OAUTH_GOOGLE_<STORAGE|DESTINATION>_CLIENT_*. */
export const GoogleOAuthClientKeySchema = z.enum(['storage', 'destination']);
export type GoogleOAuthClientKey = z.infer<typeof GoogleOAuthClientKeySchema>;

/** A configured Google scope set: OAUTH_GOOGLE_BIGQUERY_SCOPE or OAUTH_GOOGLE_SHEETS_SCOPE. */
export const GoogleOAuthScopeSetSchema = z.enum(['bigquery', 'sheets']);
export type GoogleOAuthScopeSet = z.infer<typeof GoogleOAuthScopeSetSchema>;

/** The Credential holds OAuth tokens that the named client issued for the named scope set. */
const CredentialOAuthAuthSchema = z.object({
  type: z.literal('oauth'),
  provider: z.literal('google'),
  client: GoogleOAuthClientKeySchema,
  scopes: GoogleOAuthScopeSetSchema,
  label: z.string().trim().min(1).max(255),
});

export type CredentialOAuthAuth = z.infer<typeof CredentialOAuthAuthSchema>;

const CredentialDefinitionContractObjectSchema = z.object({
  id: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).default(''),
  documentationUrl: CredentialDocumentationUrlSchema.optional(),
  auth: z.discriminatedUnion('type', [
    CredentialHeaderAuthSchema,
    CredentialGoogleServiceAccountAuthSchema,
    CredentialFieldsAuthSchema,
    CredentialOAuthAuthSchema,
  ]),
  category: CredentialCategorySchema.default('other'),
  icon: CredentialIconSchema.optional(),
  origins: z.array(z.string().url().startsWith('https://')).min(1).max(20).optional(),
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

export const CredentialDefinitionContractSchema =
  CredentialDefinitionContractObjectSchema.superRefine((contract, context) => {
    if (contract.origins === undefined) {
      if (contract.auth.type === 'header') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['origins'],
          message: 'origins are required for header auth',
        });
      }
      if (contract.validation) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['origins'],
          message: 'origins are required for a validation probe',
        });
      }
    }
    if (contract.auth.type !== 'fields') return;
    const { fields } = contract.auth;
    if (new Set(fields.map(field => field.key)).size !== fields.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['auth', 'fields'],
        message: 'field keys must be unique',
      });
    }
    const identities = fields.filter(field => field.identity);
    if (identities.length > 1 || identities.some(field => field.secret)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['auth', 'fields'],
        message: 'at most one non-secret field can be the identity',
      });
    }
  });

export type CredentialDefinitionContract = z.infer<typeof CredentialDefinitionContractSchema>;

export const CredentialRequirementSchema = z.union([
  z.string().trim().min(1).max(255),
  z.object({
    id: z.string().trim().min(1).max(255),
    optional: z.boolean().default(false),
    models: z.array(z.string().trim().min(1).max(255)).max(20).optional(),
    scopes: z.array(z.string().min(1).max(200).regex(/^\S+$/)).min(1).max(20).optional(),
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
  /** OAuth scopes OWOX requests a token for; empty for every requirement but `google-service-account`. */
  readonly scopes: readonly string[];
}

/** Any of these definitions, with these scopes; null scopes when the server cannot grant them. */
export interface AcceptedCredentialRequirement {
  readonly definitionIds: readonly string[];
  readonly scopes: readonly string[] | null;
}

/** What a binding was made for: a plugin's declared requirement, or what a consumer accepts. */
export type CredentialRequirementSnapshot =
  | NormalizedCredentialRequirement
  | AcceptedCredentialRequirement;

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
        scopes: [],
      };
    }
    return {
      key: requirement,
      definitionId: requirement,
      optional: false,
      models: [],
      scopes: [],
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
    scopes: 'definitionId' in requirement ? [] : [...new Set(requirement.scopes ?? [])].sort(),
  };
}

export interface StoredOAuthTokens {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  scope: string;
  expiry_date?: number;
}

/** Rows saved before the other kinds existed carry only `value`. */
export type CredentialSecret =
  | { readonly value: string }
  | { readonly fields: Readonly<Record<string, string>> }
  | {
      readonly oauth: {
        readonly provider: 'google';
        readonly clientId: string;
        readonly tokens: StoredOAuthTokens;
      };
    };

/** Non-secret facts read from a stored credential, shown so a member knows which account it is. */
export interface GoogleServiceAccountPublicMetadata {
  readonly clientEmail: string;
  readonly projectId: string;
  readonly privateKeyId: string;
}

export type CredentialPublicMetadata =
  | GoogleServiceAccountPublicMetadata
  | { readonly fields: Readonly<Record<string, string>> }
  | {
      readonly account: { email: string; name: string | null; picture: string | null };
      readonly scopes: readonly string[];
    };

export function secretValue(secret: CredentialSecret): string {
  if ('value' in secret) return secret.value;
  throw new Error('Credential does not hold a single secret value');
}

/** The account a Credential belongs to, for display; null when the definition names none. */
export function credentialIdentity(
  contract: CredentialDefinitionContract,
  metadata: CredentialPublicMetadata | null
): string | null {
  if (!metadata) return null;
  if ('clientEmail' in metadata) return metadata.clientEmail;
  if ('account' in metadata) return metadata.account.email;
  if (contract.auth.type !== 'fields') return null;
  const identity = contract.auth.fields.find(field => field.identity);
  return identity ? (metadata.fields[identity.key] ?? null) : null;
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
export const CREDENTIAL_CONSUMER_TYPE_STORAGE = 'storage' as const;
export type CredentialConsumerType =
  | typeof CREDENTIAL_CONSUMER_TYPE_PLUGIN_INSTALLATION
  | typeof CREDENTIAL_CONSUMER_TYPE_STORAGE;
