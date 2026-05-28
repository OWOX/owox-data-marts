import { Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateProjectMemberApiKeyCommand } from '../../dto/domain/update-project-member-api-key.command';
import type { ProjectMemberApiKeyResponseDto } from '../../dto/presentation/project-member-api-key-api.dto';
import { ProjectMemberApiKeyService } from '../../../project-member-api-keys/services/project-member-api-key.service';
import { ProjectMemberApiKeysMapper } from '../../mappers/project-member-api-keys.mapper';

@Injectable()
export class UpdateProjectMemberApiKeyService {
  constructor(
    private readonly apiKeyService: ProjectMemberApiKeyService,
    private readonly mapper: ProjectMemberApiKeysMapper
  ) {}

  async run(command: UpdateProjectMemberApiKeyCommand): Promise<ProjectMemberApiKeyResponseDto> {
    const updated = await this.apiKeyService.updateName(
      command.projectId,
      command.userId,
      command.apiKeyId,
      command.name
    );

    if (!updated) {
      throw new NotFoundException('API key not found');
    }

    return this.mapper.toApiResponse(updated);
  }
}
