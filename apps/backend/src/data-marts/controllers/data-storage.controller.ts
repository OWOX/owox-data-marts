import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { CreateDataStorageApiDto } from '../dto/presentation/create-data-storage-api.dto';
import { DataStorageAccessValidationResponseApiDto } from '../dto/presentation/data-storage-access-validation-response-api.dto';
import { DataStorageListResponseApiDto } from '../dto/presentation/data-storage-list-response-api.dto';
import { DataStorageResponseApiDto } from '../dto/presentation/data-storage-response-api.dto';
import { UpdateDataStorageApiDto } from '../dto/presentation/update-data-storage-api.dto';
import { GenerateAuthorizationUrlRequestDto } from '../dto/presentation/google-oauth/generate-authorization-url-request.dto';
import { GenerateAuthorizationUrlResponseDto } from '../dto/presentation/google-oauth/generate-authorization-url-response.dto';
import { ExchangeAuthorizationCodeRequestDto } from '../dto/presentation/google-oauth/exchange-authorization-code-request.dto';
import { ExchangeAuthorizationCodeResponseDto } from '../dto/presentation/google-oauth/exchange-authorization-code-response.dto';
import { GoogleOAuthStatusResponseDto } from '../dto/presentation/google-oauth/google-oauth-status-response.dto';
import { GoogleOAuthSettingsResponseDto } from '../dto/presentation/google-oauth/oauth-settings-response.dto';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { CreateDataStorageService } from '../use-cases/create-data-storage.service';
import { DeleteDataStorageService } from '../use-cases/delete-data-storage.service';
import { GetDataStorageService } from '../use-cases/get-data-storage.service';
import { ListDataStoragesService } from '../use-cases/list-data-storages.service';
import { UpdateDataStorageService } from '../use-cases/update-data-storage.service';
import { ValidateDataStorageAccessService } from '../use-cases/validate-data-storage-access.service';
import { GoogleOAuthFlowService } from '../services/google-oauth/google-oauth-flow.service';
import { GetStorageOAuthStatusService } from '../use-cases/google-oauth/get-storage-oauth-status.service';
import { GenerateStorageOAuthUrlService } from '../use-cases/google-oauth/generate-storage-oauth-url.service';
import { RevokeStorageOAuthService } from '../use-cases/google-oauth/revoke-storage-oauth.service';
import { ExchangeOAuthCodeService } from '../use-cases/google-oauth/exchange-oauth-code.service';
import {
  CreateDataStorageSpec,
  DeleteDataStorageSpec,
  GetDataStorageSpec,
  ListDataStoragesSpec,
  UpdateDataStorageSpec,
  ValidateDataStorageAccessSpec,
  OAuthSettingsSpec,
  OAuthAuthorizeSpec,
  OAuthExchangeSpec,
  OAuthStatusSpec,
  OAuthRevokeSpec,
} from './spec/data-storage.api';

@Controller('data-storages')
@ApiTags('DataStorages')
export class DataStorageController {
  constructor(
    private readonly updateService: UpdateDataStorageService,
    private readonly createService: CreateDataStorageService,
    private readonly getService: GetDataStorageService,
    private readonly listService: ListDataStoragesService,
    private readonly deleteService: DeleteDataStorageService,
    private readonly validateAccessService: ValidateDataStorageAccessService,
    private readonly mapper: DataStorageMapper,
    private readonly googleOAuthFlowService: GoogleOAuthFlowService,
    private readonly getOAuthStatusService: GetStorageOAuthStatusService,
    private readonly generateOAuthUrlService: GenerateStorageOAuthUrlService,
    private readonly revokeOAuthService: RevokeStorageOAuthService,
    private readonly exchangeOAuthCodeService: ExchangeOAuthCodeService
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListDataStoragesSpec()
  async getAll(
    @AuthContext() context: AuthorizationContext
  ): Promise<DataStorageListResponseApiDto[]> {
    const command = this.mapper.toListCommand(context);
    const dataStoragesDto = await this.listService.run(command);
    return this.mapper.toResponseList(dataStoragesDto);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':id')
  @UpdateDataStorageSpec()
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateDataStorageApiDto
  ): Promise<DataStorageResponseApiDto> {
    const command = this.mapper.toUpdateCommand(id, context, dto);
    const dataStorageDto = await this.updateService.run(command);
    return this.mapper.toApiResponse(dataStorageDto);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post()
  @CreateDataStorageSpec()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: CreateDataStorageApiDto
  ): Promise<DataStorageResponseApiDto> {
    const command = this.mapper.toCreateCommand(context, dto);
    const dataStorageDto = await this.createService.run(command);
    return this.mapper.toApiResponse(dataStorageDto);
  }

  // --- OAuth endpoints (must be declared before parameterized :id routes) ---

  @Auth(Role.viewer())
  @Get('oauth/settings')
  @OAuthSettingsSpec()
  async getOAuthSettings(): Promise<GoogleOAuthSettingsResponseDto> {
    return this.googleOAuthFlowService.getSettingsForType('storage');
  }

  @Auth(Role.editor())
  @Post('oauth/exchange')
  @HttpCode(200)
  @OAuthExchangeSpec()
  async exchangeOAuthCode(
    @AuthContext() context: AuthorizationContext,
    @Body() body: ExchangeAuthorizationCodeRequestDto
  ): Promise<ExchangeAuthorizationCodeResponseDto> {
    const command = this.mapper.toExchangeOAuthCodeCommand(context, body);
    return this.exchangeOAuthCodeService.run(command);
  }

  // --- Parameterized :id routes ---

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':id')
  @GetDataStorageSpec()
  async get(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<DataStorageResponseApiDto> {
    const command = this.mapper.toGetCommand(id, context);
    const dataStorageDto = await this.getService.run(command);
    return this.mapper.toApiResponse(dataStorageDto);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Delete(':id')
  @DeleteDataStorageSpec()
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    const command = this.mapper.toDeleteCommand(id, context);
    await this.deleteService.run(command);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post(':id/validate-access')
  @ValidateDataStorageAccessSpec()
  async validate(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<DataStorageAccessValidationResponseApiDto> {
    const command = this.mapper.toValidateAccessCommand(id, context);
    const validationResult = await this.validateAccessService.run(command);
    return this.mapper.toValidateAccessResponse(validationResult);
  }

  @Auth(Role.editor())
  @Post(':id/oauth/authorize')
  @HttpCode(200)
  @OAuthAuthorizeSpec()
  async generateOAuthAuthorizationUrl(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() body: GenerateAuthorizationUrlRequestDto
  ): Promise<GenerateAuthorizationUrlResponseDto> {
    const command = this.mapper.toGenerateOAuthUrlCommand(id, context, body);
    return this.generateOAuthUrlService.run(command);
  }

  @Auth(Role.viewer())
  @Get(':id/oauth/status')
  @OAuthStatusSpec()
  async getOAuthStatus(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<GoogleOAuthStatusResponseDto> {
    const command = this.mapper.toGetOAuthStatusCommand(id, context);
    return this.getOAuthStatusService.run(command);
  }

  @Auth(Role.editor())
  @Delete(':id/oauth')
  @HttpCode(204)
  @OAuthRevokeSpec()
  async revokeOAuth(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    const command = this.mapper.toRevokeOAuthCommand(id, context);
    await this.revokeOAuthService.run(command);
  }
}
