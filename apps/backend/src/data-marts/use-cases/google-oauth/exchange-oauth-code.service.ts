import { Injectable } from '@nestjs/common';
import { ExchangeOAuthCodeCommand } from '../../dto/domain/google-oauth/exchange-oauth-code.command';
import { ExchangeAuthorizationCodeResponseDto } from '../../dto/presentation/google-oauth/exchange-authorization-code-response.dto';
import { GoogleOAuthFlowService } from '../../services/google-oauth/google-oauth-flow.service';

@Injectable()
export class ExchangeOAuthCodeService {
  constructor(private readonly googleOAuthFlowService: GoogleOAuthFlowService) {}

  async run(command: ExchangeOAuthCodeCommand): Promise<ExchangeAuthorizationCodeResponseDto> {
    const result = await this.googleOAuthFlowService.exchangeAuthorizationCode(
      command.code,
      command.state,
      command.userId,
      command.projectId
    );
    return {
      success: true,
      credentialId: result.credentialId,
      user: result.user,
    };
  }
}
