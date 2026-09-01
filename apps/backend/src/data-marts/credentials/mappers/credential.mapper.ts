import { Injectable } from '@nestjs/common';
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
import {
  resolveCredentialAiModelMappings,
  type CredentialValidationResult,
} from '../credential.types';

export function mapCredentialDefinitionToApiDto(
  definition: ResolvedCredentialDefinition
): CredentialDefinitionApiDto {
  return {
    id: definition.definitionId,
    source: definition.source,
    displayName: definition.contract.displayName,
    description: definition.contract.description,
    documentationUrl: definition.contract.documentationUrl ?? null,
    secretLabel: definition.contract.auth.label,
    origins: [...definition.contract.origins],
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
      ownerUsers: resolveOwnerUsers(credential.ownerIds, users),
      contexts: extractContextSummaries(credential.contexts),
      usedBy: bindings.map(binding => ({
        consumerType: binding.consumerType,
        consumerId: binding.consumerId,
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
