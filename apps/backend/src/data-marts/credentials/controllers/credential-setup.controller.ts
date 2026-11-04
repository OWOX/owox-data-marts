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
import { CredentialSetupMapper } from '../mappers/credential-setup.mapper';

@ApiTags('Credentials')
@Controller('credential-setup')
@RejectApiKeyAuth()
@RejectPluginAuth()
export class CredentialSetupController {
  constructor(
    private readonly startSetup: StartCredentialSetupService,
    private readonly getSetup: GetCredentialSetupService,
    private readonly completeSetup: CompleteCredentialSetupService,
    private readonly cancelSetup: CancelCredentialSetupService,
    private readonly mapper: CredentialSetupMapper
  ) {}

  @Post()
  @Auth(Role.viewer(Strategy.INTROSPECT))
  @ApiCreatedResponse({ type: CredentialSetupResponseApiDto })
  async start(
    @AuthContext() context: AuthorizationContext,
    @Body() input: StartCredentialSetupApiDto
  ): Promise<CredentialSetupResponseApiDto> {
    return this.mapper.toResponse(
      await this.startSetup.run(this.mapper.toStartCommand(context, input))
    );
  }

  @Get(':id')
  @Auth(Role.viewer(Strategy.PARSE))
  @ApiOkResponse({ type: CredentialSetupResponseApiDto })
  async get(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<CredentialSetupResponseApiDto> {
    return this.mapper.toResponse(await this.getSetup.run(this.mapper.toGetCommand(context, id)));
  }

  @Post(':id/complete')
  @Auth(Role.viewer(Strategy.INTROSPECT))
  @HttpCode(200)
  @ApiOkResponse({ type: CredentialSetupResponseApiDto })
  async complete(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() input: CompleteCredentialSetupApiDto
  ): Promise<CredentialSetupResponseApiDto> {
    return this.mapper.toResponse(
      await this.completeSetup.run(this.mapper.toCompleteCommand(context, id, input))
    );
  }

  @Post(':id/cancel')
  @Auth(Role.viewer(Strategy.INTROSPECT))
  @HttpCode(200)
  @ApiOkResponse({ type: CredentialSetupResponseApiDto })
  async cancel(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<CredentialSetupResponseApiDto> {
    return this.mapper.toResponse(
      await this.cancelSetup.run(this.mapper.toCancelCommand(context, id))
    );
  }
}
