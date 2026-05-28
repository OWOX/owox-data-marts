import { Injectable } from '@nestjs/common';
import {
  CreateProjectMemberApiKeyResponseDto,
  ProjectMemberApiKeyResponseDto,
} from '../dto/presentation/project-member-api-key-api.dto';
import type { ProjectMemberApiKeyMetadata } from '../../project-member-api-keys/dto/domain/project-member-api-key-metadata.dto';

@Injectable()
export class ProjectMemberApiKeysMapper {
  toApiResponse(data: ProjectMemberApiKeyMetadata): ProjectMemberApiKeyResponseDto {
    return {
      apiKeyId: data.apiKeyId,
      name: data.name,
      expiresAt: data.expiresAt?.toISOString() ?? null,
      createdAt: data.createdAt.toISOString(),
      lastAuthenticatedAt: data.lastAuthenticatedAt?.toISOString() ?? null,
    };
  }

  toApiResponseList(data: ProjectMemberApiKeyMetadata[]): ProjectMemberApiKeyResponseDto[] {
    return data.map(d => this.toApiResponse(d));
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
