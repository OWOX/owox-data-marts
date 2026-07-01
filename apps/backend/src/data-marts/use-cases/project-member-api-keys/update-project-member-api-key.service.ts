import { Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateProjectMemberApiKeyCommand } from '../../dto/domain/update-project-member-api-key.command';
import type { ProjectMemberApiKeyMetadata } from '../../../project-member-api-keys/dto/domain/project-member-api-key-metadata.dto';
import { ProjectMemberApiKeyService } from '../../../project-member-api-keys/services/project-member-api-key.service';

@Injectable()
export class UpdateProjectMemberApiKeyService {
  constructor(private readonly apiKeyService: ProjectMemberApiKeyService) {}

  async run(command: UpdateProjectMemberApiKeyCommand): Promise<ProjectMemberApiKeyMetadata> {
    const updated = await this.apiKeyService.updateName(
      command.projectId,
      command.userId,
      command.apiKeyId,
      command.name
    );

    if (!updated) {
      throw new NotFoundException('API key not found');
    }

    return updated;
  }
}
