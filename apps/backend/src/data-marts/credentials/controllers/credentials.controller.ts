import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, type AuthorizationContext, RejectPluginAuth } from '../../../idp';
import { Role, Strategy } from '../../../idp/types/role-config.types';
import {
  CreateCredentialApiDto,
  CredentialDefinitionApiDto,
  CredentialResponseApiDto,
  UpdateCredentialApiDto,
} from '../dto/credential-api.dto';
import { CredentialMapper, mapCredentialDefinitionToApiDto } from '../mappers/credential.mapper';
import { CredentialDefinitionService } from '../services/credential-definition.service';
import { CreateCredentialService } from '../use-cases/create-credential.service';
import { DeleteCredentialService } from '../use-cases/delete-credential.service';
import { GetCredentialService } from '../use-cases/get-credential.service';
import { ListCredentialsService } from '../use-cases/list-credentials.service';
import { UpdateCredentialService } from '../use-cases/update-credential.service';
import { ValidateCredentialService } from '../use-cases/validate-credential.service';
import { ConsentCredentialDefinitionService } from '../use-cases/consent-credential-definition.service';

@ApiTags('Credentials')
@Controller('credentials')
@RejectPluginAuth()
export class CredentialsController {
  constructor(
    private readonly createCredential: CreateCredentialService,
    private readonly updateCredential: UpdateCredentialService,
    private readonly getCredential: GetCredentialService,
    private readonly listCredentials: ListCredentialsService,
    private readonly deleteCredential: DeleteCredentialService,
    private readonly validateCredential: ValidateCredentialService,
    private readonly consentCredentialDefinition: ConsentCredentialDefinitionService,
    private readonly definitions: CredentialDefinitionService,
    private readonly mapper: CredentialMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('definitions')
  @ApiOkResponse({ type: [CredentialDefinitionApiDto] })
  async listDefinitions(): Promise<CredentialDefinitionApiDto[]> {
    return (await this.definitions.list()).map(mapCredentialDefinitionToApiDto);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post()
  @ApiOkResponse({ type: CredentialResponseApiDto })
  async create(
    @AuthContext() context: AuthorizationContext,
    @Body() input: CreateCredentialApiDto
  ): Promise<CredentialResponseApiDto> {
    return this.mapper.toApiResponse(await this.createCredential.run(context, input));
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ApiOkResponse({ type: [CredentialResponseApiDto] })
  async list(@AuthContext() context: AuthorizationContext): Promise<CredentialResponseApiDto[]> {
    return (await this.listCredentials.run(context)).map(dto => this.mapper.toApiResponse(dto));
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':id')
  @ApiOkResponse({ type: CredentialResponseApiDto })
  async get(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<CredentialResponseApiDto> {
    return this.mapper.toApiResponse(await this.getCredential.run(id, context));
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Put(':id')
  @ApiOkResponse({ type: CredentialResponseApiDto })
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() input: UpdateCredentialApiDto
  ): Promise<CredentialResponseApiDto> {
    return this.mapper.toApiResponse(await this.updateCredential.run(id, context, input));
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post(':id/definition-consent')
  @HttpCode(200)
  @ApiOkResponse({ type: CredentialResponseApiDto })
  async consentDefinition(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<CredentialResponseApiDto> {
    return this.mapper.toApiResponse(await this.consentCredentialDefinition.run(id, context));
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post(':id/validate')
  @HttpCode(200)
  @ApiOkResponse({ type: CredentialResponseApiDto })
  async validate(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<CredentialResponseApiDto> {
    return this.mapper.toApiResponse(await this.validateCredential.run(id, context));
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    await this.deleteCredential.run(id, context);
  }
}
