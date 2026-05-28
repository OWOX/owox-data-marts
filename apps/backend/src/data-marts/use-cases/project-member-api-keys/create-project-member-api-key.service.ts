import { Injectable } from '@nestjs/common';
import type { CreateProjectMemberApiKeyCommand } from '../../dto/domain/create-project-member-api-key.command';
import type { CreateProjectMemberApiKeyResponseDto } from '../../dto/presentation/project-member-api-key-api.dto';
import { ProjectMemberApiKeyService } from '../../../project-member-api-keys/services/project-member-api-key.service';
import { ProjectMemberApiKeysMapper } from '../../mappers/project-member-api-keys.mapper';

@Injectable()
export class CreateProjectMemberApiKeyService {
  constructor(
    private readonly apiKeyService: ProjectMemberApiKeyService,
    private readonly mapper: ProjectMemberApiKeysMapper
  ) {}

  async run(
    command: CreateProjectMemberApiKeyCommand
  ): Promise<CreateProjectMemberApiKeyResponseDto> {
    const expiresAt = command.expiresAt ? new Date(command.expiresAt) : null;

    const result = await this.apiKeyService.createForMember(
      command.projectId,
      command.userId,
      command.name,
      command.role,
      false,
      expiresAt
    );

    return this.mapper.toCreateApiResponse({
      ...result.apiKey,
      apiKeySecret: result.apiKeySecret,
    });
  }
}
