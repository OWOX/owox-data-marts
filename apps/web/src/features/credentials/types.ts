import type { UserProjectionDto } from '../../shared/types/api';

export type CredentialValidationState = 'unknown' | 'verified' | 'rejected';

export interface CredentialDefinition {
  id: string;
  source: 'builtin' | 'external';
  displayName: string;
  description: string;
  /** Optional while a newer web build can still talk to an older backend during rollout. */
  documentationUrl?: string | null;
  secretLabel: string;
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
}

export interface CredentialConsumerReference {
  consumerType: string;
  consumerId: string;
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
  contexts: { id: string; name: string }[];
  usedBy: CredentialConsumerReference[];
  createdAt: string;
  modifiedAt: string;
}

export interface CreateCredentialRequest {
  title: string;
  definitionId: string;
  secret: { value: string };
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
  | { id: string; definitionId?: string; optional: boolean; models?: readonly string[] };

export interface NormalizedPluginCredentialRequirement {
  key: string;
  definitionId: string | null;
  optional: boolean;
  models: string[];
}

export function normalizePluginCredentialRequirement(
  requirement: PluginCredentialRequirement
): NormalizedPluginCredentialRequirement {
  if (typeof requirement === 'string') {
    if (requirement === 'ai') {
      return { key: 'ai', definitionId: null, optional: false, models: ['fast'] };
    }
    return { key: requirement, definitionId: requirement, optional: false, models: [] };
  }
  return {
    key: requirement.id,
    definitionId: requirement.definitionId ?? (requirement.id === 'ai' ? null : requirement.id),
    optional: requirement.optional,
    models: [
      ...(requirement.id === 'ai' ? (requirement.models ?? ['fast']) : (requirement.models ?? [])),
    ].sort(),
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
