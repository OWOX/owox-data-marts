import { Injectable } from '@nestjs/common';
import {
  CreateProjectMemberApiKeyResponseDto,
  ProjectMemberApiKeyResponseDto,
} from '../dto/presentation/project-member-api-key-api.dto';
import type { CreateProjectMemberApiKeyRequestDto, UpdateProjectMemberApiKeyRequestDto } from '../dto/presentation/project-member-api-key-api.dto';
import type { ProjectMemberApiKeyMetadata } from '../../project-member-api-keys/dto/domain/project-member-api-key-metadata.dto';
import type { AuthorizationContext } from '../../idp';
import { CreateProjectMemberApiKeyCommand } from '../dto/domain/create-project-member-api-key.command';
import { ListProjectMemberApiKeysCommand } from '../dto/domain/list-project-member-api-keys.command';
import { UpdateProjectMemberApiKeyCommand } from '../dto/domain/update-project-member-api-key.command';
import { RevokeProjectMemberApiKeyCommand } from '../dto/domain/revoke-project-member-api-key.command';

@Injectable()
export class ProjectMemberApiKeysMapper {
  toListCommand(context: AuthorizationContext, includeRevoked: boolean): ListProjectMemberApiKeysCommand {
    return new ListProjectMemberApiKeysCommand(context.projectId, context.userId, includeRevoked);
  }

  toCreateCommand(context: AuthorizationContext, dto: CreateProjectMemberApiKeyRequestDto): CreateProjectMemberApiKeyCommand {
    return new CreateProjectMemberApiKeyCommand(
      context.projectId,
      context.userId,
      dto.name,
      null,
      dto.expiresAt
    );
  }

  toUpdateCommand(context: AuthorizationContext, apiKeyId: string, dto: UpdateProjectMemberApiKeyRequestDto): UpdateProjectMemberApiKeyCommand {
    return new UpdateProjectMemberApiKeyCommand(context.projectId, context.userId, apiKeyId, dto.name);
  }

  toRevokeCommand(context: AuthorizationContext, apiKeyId: string): RevokeProjectMemberApiKeyCommand {
    return new RevokeProjectMemberApiKeyCommand(context.projectId, context.userId, apiKeyId);
  }

  toApiResponse(data: ProjectMemberApiKeyMetadata): ProjectMemberApiKeyResponseDto {
    return {
      apiKeyId: data.apiKeyId,
      name: data.name,
      expiresAt: data.expiresAt?.toISOString() ?? null,
      createdAt: data.createdAt.toISOString(),
      lastAuthenticatedAt: data.lastAuthenticatedAt?.toISOString() ?? null,
    };
  }

  toCreateApiResponse(
    data: ProjectMemberApiKeyMetadata & { apiKeySecret: string }
  ): CreateProjectMemberApiKeyResponseDto {
    const response = new CreateProjectMemberApiKeyResponseDto();
    Object.assign(response, this.toApiResponse(data));
    response.apiKeySecret = data.apiKeySecret;
    return response;
  }
}