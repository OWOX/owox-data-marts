import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
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
import { ListDataStoragesByTypeService } from '../use-cases/list-data-storages-by-type.service';
import { UpdateAvailabilityService } from '../use-cases/update-availability.service';
import { UpdateStorageAvailabilityApiDto } from '../dto/presentation/update-availability-api.dto';
import { ListDataStoragesByTypeCommand } from '../dto/domain/list-data-storages-by-type.command';
import { DataStorageByTypeResponseApiDto } from '../dto/presentation/data-storage-by-type-response-api.dto';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { OwnerFilter } from '../enums/owner-filter.enum';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import {
  CreateDataStorageSpec,
  DeleteDataStorageSpec,
  GetDataStorageSpec,
  ListDataStoragesSpec,
  ListDataStoragesByTypeSpec,
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
    private readonly exchangeOAuthCodeService: ExchangeOAuthCodeService,
    private readonly listByTypeService: ListDataStoragesByTypeService,
    private readonly updateAvailabilityService: UpdateAvailabilityService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  private async checkStorageAccess(
    id: string,
    context: AuthorizationContext,
    action: Action
  ): Promise<void> {
    if (!context.userId) return;
    const allowed = await this.accessDecisionService.canAccess(
      context.userId,
      context.roles ?? [],
      EntityType.STORAGE,
      id,
      action,
      context.projectId
    );
    if (!allowed) {
      throw new ForbiddenException('You do not have access to this Storage');
    }
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListDataStoragesSpec()
  async getAll(
    @AuthContext() context: AuthorizationContext,
    @Query('ownerFilter', new ParseEnumPipe(OwnerFilter, { optional: true }))
    ownerFilter?: OwnerFilter
  ): Promise<DataStorageListResponseApiDto[]> {
    const command = this.mapper.toListCommand(context, ownerFilter);
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

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('by-type/:type')
  @ListDataStoragesByTypeSpec()
  async getByType(
    @AuthContext() context: AuthorizationContext,
    @Param('type', new ParseEnumPipe(DataStorageType)) type: DataStorageType
  ): Promise<DataStorageByTypeResponseApiDto[]> {
    const command = new ListDataStoragesByTypeCommand(context.projectId, type);
    const items = await this.listByTypeService.run(command);
    return this.mapper.toByTypeResponse(items);
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
    await this.checkStorageAccess(id, context, Action.EDIT);
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
    await this.checkStorageAccess(id, context, Action.SEE);
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
    await this.checkStorageAccess(id, context, Action.EDIT);
    const command = this.mapper.toRevokeOAuthCommand(id, context);
    await this.revokeOAuthService.run(command);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Put(':id/availability')
  @HttpCode(204)
  async updateAvailability(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateStorageAvailabilityApiDto
  ): Promise<void> {
    await this.updateAvailabilityService.updateStorageSharing(
      id,
      context.projectId,
      context.userId,
      context.roles ?? [],
      dto.availableForUse,
      dto.availableForMaintenance
    );
  }
}
