import { Injectable } from '@nestjs/common';
import { RevokeDestinationOAuthCommand } from '../../dto/domain/google-oauth/revoke-destination-oauth.command';
import { DataDestinationService } from '../../services/data-destination.service';
import { GoogleOAuthFlowService } from '../../services/google-oauth/google-oauth-flow.service';

@Injectable()
export class RevokeDestinationOAuthService {
  constructor(
    private readonly dataDestinationService: DataDestinationService,
    private readonly googleOAuthFlowService: GoogleOAuthFlowService
  ) {}

  async run(command: RevokeDestinationOAuthCommand): Promise<void> {
    await this.dataDestinationService.getByIdAndProjectId(command.destinationId, command.projectId);
    await this.googleOAuthFlowService.revokeDestinationOAuth(command.destinationId);
  }
}
