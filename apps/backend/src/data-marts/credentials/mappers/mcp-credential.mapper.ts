import { Injectable } from '@nestjs/common';
import type {
  CredentialDefinitionApiDto,
  ResolvedCredentialDefinition,
} from '../dto/credential-api.dto';
import type { CredentialDto, UnavailableCredentialDto } from '../dto/credential.dto';
import type {
  McpCredentialDefinitionDto,
  McpCredentialDto,
  McpUnavailableCredentialDto,
} from '../dto/mcp-credential.dto';
import { mapCredentialDefinitionToApiDto } from './credential.mapper';

@Injectable()
export class McpCredentialMapper {
  toResolvedDefinition(dto: ResolvedCredentialDefinition): McpCredentialDefinitionDto {
    return this.toDefinition(mapCredentialDefinitionToApiDto(dto));
  }

  toDefinition(dto: CredentialDefinitionApiDto): McpCredentialDefinitionDto {
    return {
      id: dto.id,
      source: dto.source,
      displayName: dto.displayName,
      description: dto.description,
      documentationUrl: dto.documentationUrl,
      category: dto.category,
      connectors: [...dto.connectors],
      storageTypes: [...dto.storageTypes],
      destinationTypes: [...dto.destinationTypes],
      authType: dto.auth.type,
      supportsAi: dto.supportsAi,
      compatibilityLine: dto.compatibilityLine,
    };
  }

  toCredential(dto: CredentialDto): McpCredentialDto {
    return {
      id: dto.id,
      title: dto.title,
      definition: this.toDefinition(dto.definition),
      definitionConsentRequired: dto.definitionConsentRequired,
      enabled: dto.enabled,
      availableForUse: dto.availableForUse,
      availableForMaintenance: dto.availableForMaintenance,
      validationState: dto.validationState,
      validatedAt: dto.validatedAt,
      lastUsedAt: dto.lastUsedAt,
      aiModelMappings:
        dto.aiModelMappings === null
          ? null
          : {
              fast: dto.aiModelMappings.fast,
              reasoning: dto.aiModelMappings.reasoning,
              embedding: dto.aiModelMappings.embedding,
            },
      aiModelMappingModes:
        dto.aiModelMappingModes === null
          ? null
          : {
              fast: dto.aiModelMappingModes.fast,
              reasoning: dto.aiModelMappingModes.reasoning,
              embedding: dto.aiModelMappingModes.embedding,
            },
      canUse: dto.canUse,
      ownerIds: dto.ownerUsers.map(user => user.userId),
      contextIds: dto.contexts.map(context => context.id),
      usedBy: dto.usedBy.flatMap(consumer =>
        consumer.title === null
          ? []
          : [
              {
                consumerType: consumer.consumerType,
                consumerId: consumer.consumerId,
                title: consumer.title,
                requirementKey: consumer.requirementKey,
                lastUsedAt: consumer.lastUsedAt,
              },
            ]
      ),
      hiddenConsumerCount: dto.usedBy.filter(consumer => consumer.title === null).length,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }

  toListItem(
    dto: CredentialDto | UnavailableCredentialDto
  ): McpCredentialDto | McpUnavailableCredentialDto {
    if (!('state' in dto)) return this.toCredential(dto);
    return {
      id: dto.id,
      title: dto.title,
      definitionId: dto.definitionId,
      state: dto.state,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }
}
