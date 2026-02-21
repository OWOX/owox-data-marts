import { Injectable } from '@nestjs/common';
import { GenerateStorageOAuthUrlCommand } from '../../dto/domain/google-oauth/generate-storage-oauth-url.command';
import { GenerateAuthorizationUrlResponseDto } from '../../dto/presentation/google-oauth/generate-authorization-url-response.dto';
import { DataStorageService } from '../../services/data-storage.service';
import { GoogleOAuthFlowService } from '../../services/google-oauth/google-oauth-flow.service';

@Injectable()
export class GenerateStorageOAuthUrlService {
  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly googleOAuthFlowService: GoogleOAuthFlowService
  ) {}

  async run(command: GenerateStorageOAuthUrlCommand): Promise<GenerateAuthorizationUrlResponseDto> {
    await this.dataStorageService.getByProjectIdAndId(command.projectId, command.storageId);
    const result = await this.googleOAuthFlowService.generateAuthorizationUrl(
      'storage',
      command.projectId,
      command.storageId,
      command.redirectUri
    );
    return { authorizationUrl: result.authorizationUrl, state: result.state };
  }
}
