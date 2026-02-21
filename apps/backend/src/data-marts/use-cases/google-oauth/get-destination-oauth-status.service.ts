import { Injectable } from '@nestjs/common';
import { GetDestinationOAuthStatusCommand } from '../../dto/domain/google-oauth/get-destination-oauth-status.command';
import { GoogleOAuthStatusResponseDto } from '../../dto/presentation/google-oauth/google-oauth-status-response.dto';
import { DataDestinationCredentialService } from '../../services/data-destination-credential.service';
import { DataDestinationService } from '../../services/data-destination.service';
import { DestinationCredentialType } from '../../enums/destination-credential-type.enum';

@Injectable()
export class GetDestinationOAuthStatusService {
  constructor(
    private readonly dataDestinationService: DataDestinationService,
    private readonly dataDestinationCredentialService: DataDestinationCredentialService
  ) {}

  async run(command: GetDestinationOAuthStatusCommand): Promise<GoogleOAuthStatusResponseDto> {
    const destination = await this.dataDestinationService.getByIdAndProjectId(
      command.destinationId,
      command.projectId
    );

    if (!destination.credentialId) {
      return { isValid: false, user: undefined, credentialId: undefined };
    }

    const credential = await this.dataDestinationCredentialService.getById(
      destination.credentialId
    );
    if (!credential || credential.type !== DestinationCredentialType.GOOGLE_OAUTH) {
      return { isValid: false, user: undefined, credentialId: undefined };
    }

    const isValid = !!(credential.credentials as { refresh_token?: string }).refresh_token;
    return {
      isValid,
      user: credential.identity || undefined,
      credentialId: credential.id,
    };
  }
}
