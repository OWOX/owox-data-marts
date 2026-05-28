import { Injectable } from '@nestjs/common';
import type { ListProjectMemberApiKeysCommand } from '../../dto/domain/list-project-member-api-keys.command';
import type { ProjectMemberApiKeyResponseDto } from '../../dto/presentation/project-member-api-key-api.dto';
import { ProjectMemberApiKeyService } from '../../../project-member-api-keys/services/project-member-api-key.service';
import { ProjectMemberApiKeysMapper } from '../../mappers/project-member-api-keys.mapper';

@Injectable()
export class ListProjectMemberApiKeysService {
  constructor(
    private readonly apiKeyService: ProjectMemberApiKeyService,
    private readonly mapper: ProjectMemberApiKeysMapper
  ) {}

  async run(command: ListProjectMemberApiKeysCommand): Promise<ProjectMemberApiKeyResponseDto[]> {
    const keys = await this.apiKeyService.listForMember(
      command.projectId,
      command.userId,
      command.includeRevoked
    );
    return keys.map(k => this.mapper.toApiResponse(k));
  }
}
