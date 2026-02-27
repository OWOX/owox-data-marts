import { Injectable } from '@nestjs/common';
import { GetDestinationOAuthStatusCommand } from '../../dto/domain/google-oauth/get-destination-oauth-status.command';
import { GoogleOAuthStatusResponseDto } from '../../dto/presentation/google-oauth/google-oauth-status-response.dto';
import { DataDestinationService } from '../../services/data-destination.service';
import { DestinationCredentialType } from '../../enums/destination-credential-type.enum';

@Injectable()
export class GetDestinationOAuthStatusService {
  constructor(private readonly dataDestinationService: DataDestinationService) {}

  async run(command: GetDestinationOAuthStatusCommand): Promise<GoogleOAuthStatusResponseDto> {
    const destination = await this.dataDestinationService.getByIdAndProjectId(
      command.destinationId,
      command.projectId,
      { relations: ['credential'] }
    );

    if (!destination.credential) {
      return { isValid: false, user: undefined, credentialId: undefined };
    }

    if (destination.credential.type !== DestinationCredentialType.GOOGLE_OAUTH) {
      return { isValid: false, user: undefined, credentialId: undefined };
    }

    const isValid = !!(destination.credential.credentials as { refresh_token?: string })
      .refresh_token;
    return {
      isValid,
      user: destination.credential.identity || undefined,
      credentialId: destination.credential.id,
    };
  }
}
