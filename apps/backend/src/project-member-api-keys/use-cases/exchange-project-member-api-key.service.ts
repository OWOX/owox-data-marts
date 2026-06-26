import { Injectable } from '@nestjs/common';
import { AuthenticationError } from '@owox/idp-protocol';
import { IdpProviderService } from '../../idp/services/idp-provider.service';
import type { ExchangeProjectMemberApiKeyCommand } from '../dto/domain/exchange-project-member-api-key.command';
import type { ExchangeProjectMemberApiKeyResult } from '../dto/domain/exchange-project-member-api-key-result.dto';
import { ProjectMemberApiKeyService } from '../services/project-member-api-key.service';

@Injectable()
export class ExchangeProjectMemberApiKeyService {
  constructor(
    private readonly projectMemberApiKeyService: ProjectMemberApiKeyService,
    private readonly idpProviderService: IdpProviderService
  ) {}

  async run(
    command: ExchangeProjectMemberApiKeyCommand
  ): Promise<ExchangeProjectMemberApiKeyResult> {
    const apiKey = await this.projectMemberApiKeyService.verifyCredential(
      command.apiKeyId,
      command.apiKeySecret
    );
    if (!apiKey) {
      throw this.invalidCredentials();
    }

    const tokenResult = await this.idpProviderService
      .getProviderFromApp()
      .issueAccessTokenForProjectMemberApiKey(
        apiKey.apiKeyId,
        apiKey.userId,
        apiKey.projectId,
        null,
        false
      );

    await this.projectMemberApiKeyService.markAuthenticated(apiKey.apiKeyId, new Date());

    return { accessToken: tokenResult.accessToken };
  }

  private invalidCredentials(): AuthenticationError {
    return new AuthenticationError('Unauthorized');
  }
}
