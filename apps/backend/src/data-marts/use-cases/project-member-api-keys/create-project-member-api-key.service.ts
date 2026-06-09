import { Injectable } from '@nestjs/common';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import type { ProjectMemberApiKeyMetadata } from '../../../project-member-api-keys/dto/domain/project-member-api-key-metadata.dto';
import { ProjectMemberApiKeyCodecService } from '../../../project-member-api-keys/services/project-member-api-key-codec.service';
import type { CreateProjectMemberApiKeyCommand } from '../../dto/domain/create-project-member-api-key.command';
import {
  ProjectMemberApiKeyService,
  type GeneratedProjectMemberApiKey,
} from '../../../project-member-api-keys/services/project-member-api-key.service';

export type CreateProjectMemberApiKeyResult = {
  apiKey: string;
} & ProjectMemberApiKeyMetadata;

@Injectable()
export class CreateProjectMemberApiKeyService {
  constructor(
    private readonly apiKeyService: ProjectMemberApiKeyService,
    private readonly apiKeyCodecService: ProjectMemberApiKeyCodecService,
    private readonly publicOriginService: PublicOriginService
  ) {}

  async run(command: CreateProjectMemberApiKeyCommand): Promise<CreateProjectMemberApiKeyResult> {
    const expiresAt = command.expiresAt ? new Date(command.expiresAt) : null;

    const generatedKey = await this.apiKeyService.createForMember(
      command.projectId,
      command.userId,
      command.name,
      command.role,
      false,
      expiresAt
    );

    return {
      ...generatedKey.metadata,
      apiKey: this.encodeApiKey(generatedKey),
    };
  }

  private encodeApiKey(generatedKey: GeneratedProjectMemberApiKey): string {
    return this.apiKeyCodecService.encode({
      apiOrigin: this.publicOriginService.getPublicOrigin(),
      apiKeyId: generatedKey.metadata.apiKeyId,
      secret: generatedKey.secret,
    });
  }
}
