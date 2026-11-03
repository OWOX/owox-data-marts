import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  Auth,
  AuthContext,
  type AuthorizationContext,
  RejectApiKeyAuth,
  RejectPluginAuth,
} from '../../../idp';
import { Role, Strategy } from '../../../idp/types/role-config.types';
import {
  CompleteCredentialSetupApiDto,
  CredentialSetupResponseApiDto,
  StartCredentialSetupApiDto,
} from '../dto/credential-setup-api.dto';
import { StartCredentialSetupService } from '../use-cases/start-credential-setup.service';
import { GetCredentialSetupService } from '../use-cases/get-credential-setup.service';
import { CompleteCredentialSetupService } from '../use-cases/complete-credential-setup.service';
import { CancelCredentialSetupService } from '../use-cases/cancel-credential-setup.service';

@ApiTags('Credentials')
@Controller('credential-setup')
@RejectApiKeyAuth()
@RejectPluginAuth()
export class CredentialSetupController {
  constructor(
    private readonly startSetup: StartCredentialSetupService,
    private readonly getSetup: GetCredentialSetupService,
    private readonly completeSetup: CompleteCredentialSetupService,
    private readonly cancelSetup: CancelCredentialSetupService
  ) {}

  @Post()
  @Auth(Role.viewer(Strategy.INTROSPECT))
  @ApiCreatedResponse({ type: CredentialSetupResponseApiDto })
  start(
    @AuthContext() context: AuthorizationContext,
    @Body() input: StartCredentialSetupApiDto
  ): Promise<CredentialSetupResponseApiDto> {
    return this.startSetup.run(context, input);
  }

  @Get(':id')
  @Auth(Role.viewer(Strategy.PARSE))
  @ApiOkResponse({ type: CredentialSetupResponseApiDto })
  get(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<CredentialSetupResponseApiDto> {
    return this.getSetup.run(id, context);
  }

  @Post(':id/complete')
  @Auth(Role.viewer(Strategy.INTROSPECT))
  @HttpCode(200)
  @ApiOkResponse({ type: CredentialSetupResponseApiDto })
  complete(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() input: CompleteCredentialSetupApiDto
  ): Promise<CredentialSetupResponseApiDto> {
    return this.completeSetup.run(id, context, input.credentialId);
  }

  @Post(':id/cancel')
  @Auth(Role.viewer(Strategy.INTROSPECT))
  @HttpCode(200)
  @ApiOkResponse({ type: CredentialSetupResponseApiDto })
  cancel(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<CredentialSetupResponseApiDto> {
    return this.cancelSetup.run(id, context);
  }
}
