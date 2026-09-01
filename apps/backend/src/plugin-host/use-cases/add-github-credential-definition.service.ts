import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import type { ResolvedCredentialDefinition } from '../../data-marts/credentials/dto/credential-api.dto';
import { ExternalCredentialDefinitionSyncService } from '../services/external-credential-definition-sync.service';

@Injectable()
export class AddGithubCredentialDefinitionService {
  constructor(private readonly sync: ExternalCredentialDefinitionSyncService) {}

  async run(
    context: AuthorizationContext,
    repository: string
  ): Promise<ResolvedCredentialDefinition> {
    if (!context.roles?.includes('admin')) {
      throw new ForbiddenException('Only Project Admins can add Credential definitions');
    }
    return this.sync.syncLocator(repository);
  }
}
