import { Injectable, NotFoundException } from '@nestjs/common';
import type { RevokeProjectMemberApiKeyCommand } from '../../dto/domain/revoke-project-member-api-key.command';
import { ProjectMemberApiKeyService } from '../../../project-member-api-keys/services/project-member-api-key.service';

@Injectable()
export class RevokeProjectMemberApiKeyService {
  constructor(private readonly apiKeyService: ProjectMemberApiKeyService) {}

  async run(command: RevokeProjectMemberApiKeyCommand): Promise<void> {
    const revoked = await this.apiKeyService.revoke(
      command.projectId,
      command.userId,
      command.apiKeyId
    );

    if (!revoked) {
      throw new NotFoundException('API key not found');
    }
  }
}
