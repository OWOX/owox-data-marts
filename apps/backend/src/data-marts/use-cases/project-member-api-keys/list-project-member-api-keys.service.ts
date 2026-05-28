import { Injectable } from '@nestjs/common';
import type { ListProjectMemberApiKeysCommand } from '../../dto/domain/list-project-member-api-keys.command';
import type { ProjectMemberApiKeyMetadata } from '../../../project-member-api-keys/dto/domain/project-member-api-key-metadata.dto';
import { ProjectMemberApiKeyService } from '../../../project-member-api-keys/services/project-member-api-key.service';

@Injectable()
export class ListProjectMemberApiKeysService {
  constructor(private readonly apiKeyService: ProjectMemberApiKeyService) {}

  async run(command: ListProjectMemberApiKeysCommand): Promise<ProjectMemberApiKeyMetadata[]> {
    return this.apiKeyService.listForMember(
      command.projectId,
      command.userId,
      command.includeRevoked
    );
  }
}
