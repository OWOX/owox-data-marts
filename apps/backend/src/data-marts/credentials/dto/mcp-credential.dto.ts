import type {
  CredentialCategory,
  CredentialDefinitionSource,
  CredentialValidationState,
} from '../credential.types';

export interface McpCredentialAiModelMappings {
  fast?: string;
  reasoning?: string;
  embedding?: string;
}

export interface McpCredentialAiModelMappingModes {
  fast?: 'recommended' | 'override';
  reasoning?: 'recommended' | 'override';
  embedding?: 'recommended' | 'override';
}

export interface McpCredentialDefinitionDto {
  id: string;
  source: CredentialDefinitionSource;
  displayName: string;
  description: string;
  documentationUrl: string | null;
  category: CredentialCategory;
  connectors: string[];
  storageTypes: string[];
  destinationTypes: string[];
  authType: 'header' | 'google-service-account' | 'fields' | 'oauth' | 'custom-connector';
  supportsAi: boolean;
  compatibilityLine: string | null;
}

export interface McpCredentialConsumerDto {
  consumerType: string;
  consumerId: string;
  title: string;
  requirementKey: string;
  lastUsedAt: Date | null;
}

export interface McpCredentialDto {
  id: string;
  title: string;
  definition: McpCredentialDefinitionDto;
  definitionConsentRequired: boolean;
  enabled: boolean;
  availableForUse: boolean;
  availableForMaintenance: boolean;
  validationState: CredentialValidationState;
  validatedAt: Date | null;
  lastUsedAt: Date | null;
  aiModelMappings: McpCredentialAiModelMappings | null;
  aiModelMappingModes: McpCredentialAiModelMappingModes | null;
  canUse: boolean;
  ownerIds: string[];
  contextIds: string[];
  usedBy: McpCredentialConsumerDto[];
  hiddenConsumerCount: number;
  createdAt: Date;
  modifiedAt: Date;
}

export interface McpUnavailableCredentialDto {
  id: string;
  title: string;
  definitionId: string;
  state: 'unavailable';
  createdAt: Date;
  modifiedAt: Date;
}

export interface McpUpdateCredentialInput {
  title?: string;
  ownerIds?: string[];
  contextIds?: string[];
  enabled?: boolean;
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
  aiModelMappings?: McpCredentialAiModelMappings | null;
  aiModelMappingModes?: McpCredentialAiModelMappingModes | null;
}

export interface McpStartCredentialSetupInput {
  definitionId?: string;
  credentialId?: string;
  title?: string;
}
