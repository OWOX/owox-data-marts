import { Injectable } from '@nestjs/common';
import { GenerateDestinationOAuthUrlCommand } from '../../dto/domain/google-oauth/generate-destination-oauth-url.command';
import { GenerateAuthorizationUrlResponseDto } from '../../dto/presentation/google-oauth/generate-authorization-url-response.dto';
import { DataDestinationService } from '../../services/data-destination.service';
import { GoogleOAuthFlowService } from '../../services/google-oauth/google-oauth-flow.service';

@Injectable()
export class GenerateDestinationOAuthUrlService {
  constructor(
    private readonly dataDestinationService: DataDestinationService,
    private readonly googleOAuthFlowService: GoogleOAuthFlowService
  ) {}

  async run(
    command: GenerateDestinationOAuthUrlCommand
  ): Promise<GenerateAuthorizationUrlResponseDto> {
    if (command.destinationId) {
      await this.dataDestinationService.getByIdAndProjectId(
        command.destinationId,
        command.projectId
      );
    }
    const result = await this.googleOAuthFlowService.generateAuthorizationUrl(
      'destination',
      command.projectId,
      command.destinationId,
      command.redirectUri
    );
    return { authorizationUrl: result.authorizationUrl, state: result.state };
  }
}
