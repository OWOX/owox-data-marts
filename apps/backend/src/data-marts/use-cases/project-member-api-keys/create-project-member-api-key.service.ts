import { Injectable } from '@nestjs/common';
import type { CreateProjectMemberApiKeyCommand } from '../../dto/domain/create-project-member-api-key.command';
import {
  ProjectMemberApiKeyService,
  type CreateProjectMemberApiKeyResult,
} from '../../../project-member-api-keys/services/project-member-api-key.service';

@Injectable()
export class CreateProjectMemberApiKeyService {
  constructor(private readonly apiKeyService: ProjectMemberApiKeyService) {}

  async run(command: CreateProjectMemberApiKeyCommand): Promise<CreateProjectMemberApiKeyResult> {
    const expiresAt = command.expiresAt ? new Date(command.expiresAt) : null;

    return this.apiKeyService.createForMember(
      command.projectId,
      command.userId,
      command.name,
      command.role,
      false,
      expiresAt
    );
  }
}
