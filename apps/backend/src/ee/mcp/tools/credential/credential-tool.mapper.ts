import type { AuthorizationContext } from '../../../../idp';
import type {
  CredentialSetupDto,
  McpCredentialDefinitionDto,
  McpCredentialDto,
  McpUnavailableCredentialDto,
} from '../../../../data-marts/credentials/facades/mcp-credentials.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { buildCredentialSetupUiPath } from '../data-mart-ui-path';
import { joinPublicOrigin } from '../mcp-public-url.util';

export class CredentialToolMapper {
  toSetupUrl(projectId: string, setupId: string, publicOrigin: string): string {
    return joinPublicOrigin(publicOrigin, buildCredentialSetupUiPath(projectId, setupId));
  }

  toActor(context: McpAuthContext): AuthorizationContext {
    return {
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
    };
  }

  toDefinition(dto: McpCredentialDefinitionDto) {
    return {
      definition_id: dto.id,
      source: dto.source,
      display_name: dto.displayName,
      description: dto.description,
      documentation_url: dto.documentationUrl,
      category: dto.category,
      connectors: dto.connectors,
      storage_types: dto.storageTypes,
      destination_types: dto.destinationTypes,
      auth_type: dto.authType,
      supports_ai: dto.supportsAi,
      compatibility_line: dto.compatibilityLine,
    };
  }

  toCredential(dto: McpCredentialDto) {
    return {
      credential_id: dto.id,
      title: dto.title,
      definition: this.toDefinition(dto.definition),
      definition_consent_required: dto.definitionConsentRequired,
      enabled: dto.enabled,
      available_for_use: dto.availableForUse,
      available_for_maintenance: dto.availableForMaintenance,
      validation_state: dto.validationState,
      validated_at: dto.validatedAt?.toISOString() ?? null,
      last_used_at: dto.lastUsedAt?.toISOString() ?? null,
      ai_model_mappings: dto.aiModelMappings,
      ai_model_mapping_modes: dto.aiModelMappingModes,
      can_use: dto.canUse,
      owner_ids: dto.ownerIds,
      context_ids: dto.contextIds,
      used_by: dto.usedBy.map(consumer => ({
        consumer_type: consumer.consumerType,
        consumer_id: consumer.consumerId,
        title: consumer.title,
        requirement_key: consumer.requirementKey,
        last_used_at: consumer.lastUsedAt?.toISOString() ?? null,
      })),
      hidden_consumer_count: dto.hiddenConsumerCount,
      created_at: dto.createdAt.toISOString(),
      modified_at: dto.modifiedAt.toISOString(),
    };
  }

  toListItem(dto: McpCredentialDto | McpUnavailableCredentialDto) {
    if (!('state' in dto)) return this.toCredential(dto);
    return {
      credential_id: dto.id,
      title: dto.title,
      definition_id: dto.definitionId,
      state: dto.state,
      created_at: dto.createdAt.toISOString(),
      modified_at: dto.modifiedAt.toISOString(),
    };
  }

  toSetup(dto: CredentialSetupDto) {
    return {
      setup_id: dto.id,
      mode: dto.mode,
      status: dto.status,
      definition_id: dto.definitionId,
      credential_id: dto.credentialId,
      created_at: dto.createdAt.toISOString(),
      expires_at: dto.expiresAt.toISOString(),
      completed_at: dto.completedAt?.toISOString() ?? null,
    };
  }
}
