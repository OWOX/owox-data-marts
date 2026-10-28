import { Injectable } from '@nestjs/common';
import { storageTypesForDefinition } from '../../data-storage-types/storage-credential-state';
import { UserProjectionsFetcherService } from '../../services/user-projections-fetcher.service';
import { extractContextSummaries } from '../../utils/extract-context-summaries';
import { resolveOwnerUsers } from '../../utils/resolve-owner-users';
import type {
  CredentialDefinitionApiDto,
  CredentialResponseApiDto,
  ResolvedCredentialDefinition,
} from '../dto/credential-api.dto';
import type { CredentialDto } from '../dto/credential.dto';
import type { CredentialConsumerBinding } from '../entities/credential-consumer-binding.entity';
import type { Credential } from '../entities/credential.entity';
import type { CredentialConsumerTitles } from '../services/credential-consumer-titles.service';
import { secretFieldKeysWithValue } from '../services/credential-fields';
import {
  credentialIdentity,
  resolveCredentialAiModelMappings,
  type CredentialDefinitionContract,
  type CredentialValidationResult,
} from '../credential.types';

function mapAuth(auth: CredentialDefinitionContract['auth']): CredentialDefinitionApiDto['auth'] {
  if (auth.type === 'fields')
    return { type: 'fields', fields: auth.fields.map(field => ({ ...field })) };
  if (auth.type === 'oauth') return { type: 'oauth', provider: auth.provider, label: auth.label };
  return { type: auth.type };
}

export function mapCredentialDefinitionToApiDto(
  definition: ResolvedCredentialDefinition
): CredentialDefinitionApiDto {
  return {
    id: definition.definitionId,
    source: definition.source,
    displayName: definition.contract.displayName,
    description: definition.contract.description,
    documentationUrl: definition.contract.documentationUrl ?? null,
    category: definition.contract.category,
    icon: definition.contract.icon ?? null,
    storageTypes: storageTypesForDefinition(definition.definitionId),
    secretLabel: 'label' in definition.contract.auth ? definition.contract.auth.label : '',
    auth: mapAuth(definition.contract.auth),
    origins: [...(definition.contract.origins ?? [])],
    supportsAi: definition.contract.ai !== undefined,
    ai: definition.contract.ai ?? null,
    compatibilityLine: definition.compatibilityLine,
  };
}

@Injectable()
export class CredentialMapper {
  constructor(private readonly userProjections: UserProjectionsFetcherService) {}

  async toDto(
    credential: Credential,
    definition: ResolvedCredentialDefinition,
    bindings: readonly CredentialConsumerBinding[],
    lastUsedAt: Date | null,
    canUse: boolean,
    /** Titles of the consumers the member can see, by consumer type, then id. */
    consumerTitles: CredentialConsumerTitles,
    validation?: CredentialValidationResult
  ): Promise<CredentialDto> {
    const users = await this.userProjections.fetchUserProjectionsList(credential.ownerIds);
    return {
      id: credential.id,
      projectId: credential.projectId,
      title: credential.title,
      definition: mapCredentialDefinitionToApiDto(definition),
      definitionConsentRequired:
        definition.source === 'external' &&
        definition.compatibilityLine !== credential.acceptedCompatibilityLine,
      enabled: credential.enabled,
      availableForUse: credential.availableForUse,
      availableForMaintenance: credential.availableForMaintenance,
      validationState: validation?.state ?? credential.validationState ?? 'unknown',
      validationMessage: validation?.message ?? credential.validationMessage ?? null,
      validatedAt: validation?.validatedAt ?? credential.validatedAt ?? null,
      lastUsedAt,
      aiModelMappings: resolveCredentialAiModelMappings(
        credential.aiModelMappings,
        credential.aiModelMappingModes,
        definition.contract.ai?.recommended
      ),
      aiModelMappingModes: credential.aiModelMappingModes,
      publicMetadata: credential.publicMetadata ?? null,
      identity: credentialIdentity(definition.contract, credential.publicMetadata ?? null),
      setSecretFieldKeys: secretFieldKeysWithValue(definition.contract.auth, {
        secret: credential.secret,
        publicMetadata: credential.publicMetadata ?? null,
      }),
      canUse,
      ownerUsers: resolveOwnerUsers(credential.ownerIds, users),
      contexts: extractContextSummaries(credential.contexts),
      usedBy: bindings.map(binding => ({
        consumerType: binding.consumerType,
        consumerId: binding.consumerId,
        title: consumerTitles.get(binding.consumerType)?.get(binding.consumerId) ?? null,
        requirementKey: binding.requirementKey,
        lastUsedAt: binding.lastUsedAt,
      })),
      createdAt: credential.createdAt,
      modifiedAt: credential.modifiedAt,
    };
  }

  toApiResponse(dto: CredentialDto): CredentialResponseApiDto {
    return { ...dto, secretConfigured: true };
  }
}
