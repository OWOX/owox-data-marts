import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, RejectApiKeyAuth } from '../decorators';
import type { AuthorizationContext } from '../types';
import { Role, Strategy } from '../types';
import { IssueIntercomJwtService } from '../use-cases/issue-intercom-jwt.service';
import { IssueIntercomJwtSpec } from './spec/intercom.api';
import { IntercomMapper } from '../mappers/intercom.mapper';
import { IntercomTokenResponseApiDto } from '../dto/presentation/intercom-token-response-api.dto';

@ApiTags('Intercom')
@Controller('intercom')
@RejectApiKeyAuth()
export class IntercomController {
  constructor(
    private readonly issueIntercomJwtUseCaseService: IssueIntercomJwtService,
    private readonly mapper: IntercomMapper
  ) {}

  // Not @ViewOnlySafe: view-only sessions must not get an Intercom JWT, so the
  // widget can never boot for them (see IntercomChat on the client).
  @Auth(Role.viewer(Strategy.PARSE))
  @Post('jwt')
  @HttpCode(HttpStatus.OK)
  @IssueIntercomJwtSpec()
  async issueJwt(@AuthContext() ctx: AuthorizationContext): Promise<IntercomTokenResponseApiDto> {
    const command = this.mapper.toIssueJwtCommand(ctx);
    const result = await this.issueIntercomJwtUseCaseService.run(command);
    return this.mapper.toResponse(result);
  }
}
