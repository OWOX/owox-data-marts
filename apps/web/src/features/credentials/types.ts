import type { UserProjectionDto } from '../../shared/types/api';
import type { ContextSummary } from '../contexts/types/context.types';

export type CredentialValidationState = 'unknown' | 'verified' | 'rejected';

export type CredentialCategory = 'google' | 'aws' | 'snowflake' | 'databricks' | 'ai' | 'other';

export type CredentialIcon =
  | 'google'
  | 'aws'
  | 'snowflake'
  | 'databricks'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'openrouter'
  | 'github';

export interface CredentialDefinitionField {
  key: string;
  label: string;
  input: 'text' | 'password' | 'multiline';
  secret: boolean;
  required: boolean;
  identity: boolean;
}

export type CredentialDefinitionAuth =
  | { type: 'header' | 'google-service-account' }
  | { type: 'fields'; fields: CredentialDefinitionField[] }
  | { type: 'oauth'; provider: 'google' };

export interface CredentialDefinition {
  id: string;
  source: 'builtin' | 'external';
  displayName: string;
  description: string;
  /** Optional while a newer web build can still talk to an older backend during rollout. */
  documentationUrl?: string | null;
  /** Empty for `fields` definitions. */
  secretLabel: string;
  /** Optional while a newer web build can still talk to an older backend during rollout. */
  category?: CredentialCategory;
  /** Icon key of a Storage provider; null or missing falls back to a generic key icon. */
  icon?: CredentialIcon | null;
  /** Storage types that accept this definition. */
  storageTypes?: string[];
  origins: string[];
  supportsAi: boolean;
  ai: {
    adapter: 'openai' | 'anthropic' | 'google' | 'openrouter' | 'openai-compatible';
    baseUrl: string;
    models?: {
      language: { id: string; name: string }[];
      embedding: { id: string; name: string }[];
    };
    recommended?: Partial<Record<'fast' | 'reasoning' | 'embedding', string>>;
  } | null;
  compatibilityLine: string | null;
  /** Optional while a newer web build can still talk to an older backend during rollout. */
  auth?: CredentialDefinitionAuth;
}

/** Non-secret facts from a stored Google service account key. */
export interface CredentialPublicMetadata {
  clientEmail: string;
  projectId: string;
  privateKeyId: string;
}

/** Non-secret fields of a `fields` Credential. */
export interface CredentialFieldsMetadata {
  fields: Record<string, string>;
}

/** The connected Google account of an `oauth` Credential. */
export interface CredentialOAuthMetadata {
  account: { email: string; name: string | null; picture: string | null };
  scopes: string[];
}

export type CredentialPublicMetadataValue =
  | CredentialPublicMetadata
  | CredentialFieldsMetadata
  | CredentialOAuthMetadata;

export function isServiceAccountMetadata(
  metadata: CredentialPublicMetadataValue | null | undefined
): metadata is CredentialPublicMetadata {
  return metadata != null && 'clientEmail' in metadata;
}

export function isFieldsMetadata(
  metadata: CredentialPublicMetadataValue | null | undefined
): metadata is CredentialFieldsMetadata {
  return metadata != null && 'fields' in metadata;
}

export function isOAuthMetadata(
  metadata: CredentialPublicMetadataValue | null | undefined
): metadata is CredentialOAuthMetadata {
  return metadata != null && 'account' in metadata;
}

export interface CredentialConsumerReference {
  consumerType: string;
  consumerId: string;
  /** The consumer's title; null when the member cannot see it. */
  title?: string | null;
  requirementKey: string;
  lastUsedAt: string | null;
}

export interface Credential {
  id: string;
  projectId: string;
  title: string;
  definition: CredentialDefinition;
  secretConfigured: true;
  definitionConsentRequired: boolean;
  enabled: boolean;
  availableForUse: boolean;
  availableForMaintenance: boolean;
  validationState: CredentialValidationState;
  validationMessage: string | null;
  validatedAt: string | null;
  lastUsedAt: string | null;
  aiModelMappings: Record<string, string> | null;
  aiModelMappingModes: Record<string, 'recommended' | 'override'> | null;
  ownerUsers: UserProjectionDto[];
  contexts: ContextSummary[];
  usedBy: CredentialConsumerReference[];
  /** Keys of secret fields that hold a stored value; never the values. */
  setSecretFieldKeys?: string[];
  /** Optional for the same rolling-deploy reason as CredentialDefinition.auth. */
  publicMetadata?: CredentialPublicMetadataValue | null;
  identity?: string | null;
  canUse?: boolean;
  createdAt: string;
  modifiedAt: string;
}

export interface CreateCredentialRequest {
  title: string;
  definitionId: string;
  secret?: { value: string };
  fields?: Record<string, string>;
  ownerIds?: string[];
  contextIds?: string[];
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
  aiModelMappings?: Record<string, string>;
  aiModelMappingModes?: Record<string, 'recommended' | 'override'>;
}

export interface UpdateCredentialRequest {
  title?: string;
  secret?: { value: string };
  /** Omitted keeps a field, `null` clears an optional one. */
  fields?: Record<string, string | null>;
  ownerIds?: string[];
  contextIds?: string[];
  enabled?: boolean;
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
  aiModelMappings?: Record<string, string> | null;
  aiModelMappingModes?: Record<string, 'recommended' | 'override'> | null;
}

export type PluginCredentialRequirement =
  | string
  | {
      id: string;
      definitionId?: string;
      optional: boolean;
      models?: readonly string[];
      scopes?: readonly string[];
    };

export interface NormalizedPluginCredentialRequirement {
  key: string;
  definitionId: string | null;
  optional: boolean;
  models: string[];
  scopes: string[];
}

export function normalizePluginCredentialRequirement(
  requirement: PluginCredentialRequirement
): NormalizedPluginCredentialRequirement {
  if (typeof requirement === 'string') {
    if (requirement === 'ai') {
      return { key: 'ai', definitionId: null, optional: false, models: ['fast'], scopes: [] };
    }
    return { key: requirement, definitionId: requirement, optional: false, models: [], scopes: [] };
  }
  return {
    key: requirement.id,
    definitionId: requirement.definitionId ?? (requirement.id === 'ai' ? null : requirement.id),
    optional: requirement.optional,
    models: [
      ...(requirement.id === 'ai' ? (requirement.models ?? ['fast']) : (requirement.models ?? [])),
    ].sort(),
    scopes: [...new Set(requirement.scopes ?? [])].sort(),
  };
}

export function isCredentialEligible(
  credential: Credential,
  requirement: NormalizedPluginCredentialRequirement
): boolean {
  if (!credential.enabled || credential.definitionConsentRequired) return false;
  if (requirement.definitionId !== null) {
    return credential.definition.id === requirement.definitionId;
  }
  if (!credential.definition.supportsAi) return false;
  return requirement.models.every(model => Boolean(credential.aiModelMappings?.[model]));
}

export interface GoogleOAuthExchangeRequest {
  code: string;
  state: string;
  title?: string;
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
}
