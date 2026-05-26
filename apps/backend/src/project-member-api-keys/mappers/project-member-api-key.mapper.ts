import { Injectable } from '@nestjs/common';
import type { ProjectMemberApiKeyMetadata } from '../dto/domain/project-member-api-key-metadata.dto';
import type { ProjectMemberApiKey } from '../entities/project-member-api-key.entity';

@Injectable()
export class ProjectMemberApiKeyMapper {
  toMetadata(entity: ProjectMemberApiKey): ProjectMemberApiKeyMetadata {
    return {
      apiKeyId: entity.apiKeyId,
      projectId: entity.projectId,
      userId: entity.userId,
      name: entity.name,
      role: entity.role,
      readOnly: entity.readOnly,
      expiresAt: entity.expiresAt,
      revokedAt: entity.revokedAt,
      lastAuthenticatedAt: entity.lastAuthenticatedAt,
      createdAt: entity.createdAt,
      modifiedAt: entity.modifiedAt,
    };
  }

  toMetadataList(entities: ProjectMemberApiKey[]): ProjectMemberApiKeyMetadata[] {
    return entities.map(entity => this.toMetadata(entity));
  }
}
