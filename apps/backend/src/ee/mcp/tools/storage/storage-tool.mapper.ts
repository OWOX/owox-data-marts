import type { AuthorizationContext } from '../../../../idp';
import type { StorageCredentialSummary } from '../../../../data-marts/data-storage-types/storage-credential-state';
import type { ListStorageResourcesDto } from '../../../../data-marts/dto/domain/list-storage-resources.dto';
import type {
  McpStorageDto,
  McpStorageSummary,
} from '../../../../data-marts/facades/mcp-storage-management.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';

export class StorageToolMapper {
  toActor(context: McpAuthContext): AuthorizationContext {
    return { projectId: context.projectId, userId: context.userId, roles: context.roles };
  }

  toSummary(dto: McpStorageSummary) {
    return {
      storage_id: dto.id,
      title: dto.title,
      storage_type: dto.type,
      created_at: dto.createdAt,
      modified_at: dto.modifiedAt,
    };
  }

  toStorage(dto: McpStorageDto) {
    return {
      storage_id: dto.id,
      title: dto.title,
      storage_type: dto.type,
      configuration: dto.configuration,
      credential: this.toCredential(dto.credential),
      owners: dto.owners.map(owner => ({
        user_id: owner.userId,
        name: owner.name,
        email: owner.email,
      })),
      contexts: dto.contexts.map(context => ({
        context_id: context.id,
        name: context.name,
        icon: context.icon,
      })),
      available_for_use: dto.availableForUse,
      available_for_maintenance: dto.availableForMaintenance,
      created_at: dto.createdAt,
      modified_at: dto.modifiedAt,
    };
  }

  toCredential(dto: StorageCredentialSummary | null) {
    if (!dto) return null;
    if (dto.access !== 'visible') return { access: dto.access, state: dto.state };
    return {
      access: dto.access,
      credential_id: dto.id,
      title: dto.title,
      definition_id: dto.definitionId,
      provider_name: dto.providerName,
      identity: dto.identity,
      state: dto.state,
    };
  }

  toResources(id: string, dto: ListStorageResourcesDto) {
    return {
      storage_id: id,
      ...(dto.namespaces
        ? { namespaces: dto.namespaces.map(node => ({ id: node.id, label: node.label })) }
        : {}),
      ...(dto.resources
        ? {
            resources: dto.resources.map(resource => ({
              id: resource.id,
              group_id: resource.groupId,
              type: resource.type,
              fully_qualified_name: resource.fullyQualifiedName,
              location: resource.location,
              location_mismatch: resource.locationMismatch,
            })),
          }
        : {}),
    };
  }
}
