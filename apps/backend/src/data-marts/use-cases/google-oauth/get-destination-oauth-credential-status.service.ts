import { ForbiddenException, Injectable } from '@nestjs/common';
import { GetDestinationOAuthCredentialStatusCommand } from '../../dto/domain/google-oauth/get-destination-oauth-credential-status.command';
import { GoogleOAuthStatusResponseDto } from '../../dto/presentation/google-oauth/google-oauth-status-response.dto';
import { DataDestinationCredentialService } from '../../services/data-destination-credential.service';
import { DestinationCredentialType } from '../../enums/destination-credential-type.enum';

@Injectable()
export class GetDestinationOAuthCredentialStatusService {
  constructor(
    private readonly dataDestinationCredentialService: DataDestinationCredentialService
  ) {}

  async run(
    command: GetDestinationOAuthCredentialStatusCommand
  ): Promise<GoogleOAuthStatusResponseDto> {
    const credential = await this.dataDestinationCredentialService.getById(command.credentialId);

    if (!credential || credential.type !== DestinationCredentialType.GOOGLE_OAUTH) {
      return { isValid: false, user: undefined, credentialId: undefined };
    }

    if (credential.projectId !== command.projectId) {
      throw new ForbiddenException('Credential does not belong to your project');
    }

    const isValid = !!(credential.credentials as { refresh_token?: string }).refresh_token;
    return {
      isValid,
      user: credential.identity || undefined,
      credentialId: credential.id,
    };
  }
}
