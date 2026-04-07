import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { OwnerFilter } from '../enums/owner-filter.enum';
import { CreateDataDestinationApiDto } from '../dto/presentation/create-data-destination-api.dto';
import { CreateDataDestinationService } from '../use-cases/create-data-destination.service';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { UpdateDataDestinationApiDto } from '../dto/presentation/update-data-destination-api.dto';
import { DataDestinationResponseApiDto } from '../dto/presentation/data-destination-response-api.dto';
import { UpdateDataDestinationService } from '../use-cases/update-data-destination.service';
import { GetDataDestinationService } from '../use-cases/get-data-destination.service';
import { ListDataDestinationsService } from '../use-cases/list-data-destinations.service';
import { ListDataDestinationsByTypeService } from '../use-cases/list-data-destinations-by-type.service';
import { DataDestinationByTypeResponseApiDto } from '../dto/presentation/data-destination-by-type-response-api.dto';
import { ListDataDestinationsByTypeCommand } from '../dto/domain/list-data-destinations-by-type.command';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { Auth, AuthContext, AuthorizationContext } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { GenerateAuthorizationUrlRequestDto } from '../dto/presentation/google-oauth/generate-authorization-url-request.dto';
import { GenerateAuthorizationUrlResponseDto } from '../dto/presentation/google-oauth/generate-authorization-url-response.dto';
import { ExchangeAuthorizationCodeRequestDto } from '../dto/presentation/google-oauth/exchange-authorization-code-request.dto';
import { ExchangeAuthorizationCodeResponseDto } from '../dto/presentation/google-oauth/exchange-authorization-code-response.dto';
import { GoogleOAuthStatusResponseDto } from '../dto/presentation/google-oauth/google-oauth-status-response.dto';
import { GoogleOAuthSettingsResponseDto } from '../dto/presentation/google-oauth/oauth-settings-response.dto';

import {
  CreateDataDestinationSpec,
  DeleteDataDestinationSpec,
  GetDataDestinationSpec,
  ListDataDestinationsSpec,
  ListDataDestinationsByTypeSpec,
  RotateSecretKeySpec,
  UpdateDataDestinationSpec,
  OAuthSettingsSpec,
  OAuthAuthorizeSpec,
  OAuthExchangeSpec,
  OAuthCredentialStatusSpec,
  OAuthStatusSpec,
  OAuthRevokeSpec,
} from './spec/data-destination.api';
import { ApiTags } from '@nestjs/swagger';
import { DeleteDataDestinationService } from '../use-cases/delete-data-destination.service';
import { RotateSecretKeyService } from '../use-cases/rotate-secret-key.service';
import { GoogleOAuthFlowService } from '../services/google-oauth/google-oauth-flow.service';
import { GetDestinationOAuthStatusService } from '../use-cases/google-oauth/get-destination-oauth-status.service';
import { GetDestinationOAuthCredentialStatusService } from '../use-cases/google-oauth/get-destination-oauth-credential-status.service';
import { GenerateDestinationOAuthUrlService } from '../use-cases/google-oauth/generate-destination-oauth-url.service';
import { RevokeDestinationOAuthService } from '../use-cases/google-oauth/revoke-destination-oauth.service';
import { ExchangeOAuthCodeService } from '../use-cases/google-oauth/exchange-oauth-code.service';
import { UpdateSharingService } from '../use-cases/update-sharing.service';
import { UpdateDestinationAvailabilityApiDto } from '../dto/presentation/update-sharing-api.dto';

@Controller('data-destinations')
@ApiTags('DataDestinations')
export class DataDestinationController {
  constructor(
    private readonly createService: CreateDataDestinationService,
    private readonly updateService: UpdateDataDestinationService,
    private readonly getService: GetDataDestinationService,
    private readonly listService: ListDataDestinationsService,
    private readonly deleteService: DeleteDataDestinationService,
    private readonly rotateSecretKeyService: RotateSecretKeyService,
    private readonly mapper: DataDestinationMapper,
    private readonly googleOAuthFlowService: GoogleOAuthFlowService,
    private readonly getOAuthStatusService: GetDestinationOAuthStatusService,
    private readonly getOAuthCredentialStatusService: GetDestinationOAuthCredentialStatusService,
    private readonly generateOAuthUrlService: GenerateDestinationOAuthUrlService,
    private readonly revokeOAuthService: RevokeDestinationOAuthService,
    private readonly exchangeOAuthCodeService: ExchangeOAuthCodeService,
    private readonly listByTypeService: ListDataDestinationsByTypeService,
    private readonly updateSharingService: UpdateSharingService
  ) {}

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post()
  @CreateDataDestinationSpec()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: CreateDataDestinationApiDto
  ): Promise<DataDestinationResponseApiDto> {
    const command = this.mapper.toCreateCommand(context, dto);
    const dataDestinationDto = await this.createService.run(command);
    return await this.mapper.toApiResponse(dataDestinationDto);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('by-type/:type')
  @ListDataDestinationsByTypeSpec()
  async getByType(
    @AuthContext() context: AuthorizationContext,
    @Param('type', new ParseEnumPipe(DataDestinationType)) type: DataDestinationType
  ): Promise<DataDestinationByTypeResponseApiDto[]> {
    const command = new ListDataDestinationsByTypeCommand(context.projectId, type);
    const items = await this.listByTypeService.run(command);
    return this.mapper.toByTypeResponse(items);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Put(':id')
  @UpdateDataDestinationSpec()
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateDataDestinationApiDto
  ): Promise<DataDestinationResponseApiDto> {
    const command = this.mapper.toUpdateCommand(id, context, dto);
    const dataDestinationDto = await this.updateService.run(command);
    return await this.mapper.toApiResponse(dataDestinationDto);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListDataDestinationsSpec()
  async getAll(
    @AuthContext() context: AuthorizationContext,
    @Query('ownerFilter', new ParseEnumPipe(OwnerFilter, { optional: true }))
    ownerFilter?: OwnerFilter
  ): Promise<DataDestinationResponseApiDto[]> {
    const command = this.mapper.toListCommand(context, ownerFilter);
    const dataDestinationsDto = await this.listService.run(command);
    return await this.mapper.toResponseList(dataDestinationsDto);
  }

  // --- OAuth endpoints (must be declared before parameterized :id routes) ---

  @Auth(Role.viewer())
  @Get('oauth/settings')
  @OAuthSettingsSpec()
  async getOAuthSettings(): Promise<GoogleOAuthSettingsResponseDto> {
    return this.googleOAuthFlowService.getSettingsForType('destination');
  }

  @Auth(Role.viewer())
  @Get('oauth/credential-status/:credentialId')
  @OAuthCredentialStatusSpec()
  async getOAuthCredentialStatus(
    @AuthContext() context: AuthorizationContext,
    @Param('credentialId') credentialId: string
  ): Promise<GoogleOAuthStatusResponseDto> {
    const command = this.mapper.toGetOAuthCredentialStatusCommand(credentialId, context);
    return this.getOAuthCredentialStatusService.run(command);
  }

  @Auth(Role.viewer())
  @Post('oauth/authorize')
  @HttpCode(200)
  @OAuthAuthorizeSpec()
  async generateOAuthAuthorizationUrlStandalone(
    @AuthContext() context: AuthorizationContext,
    @Body() body: GenerateAuthorizationUrlRequestDto
  ): Promise<GenerateAuthorizationUrlResponseDto> {
    const command = this.mapper.toGenerateOAuthUrlCommand(context, body);
    return this.generateOAuthUrlService.run(command);
  }

  @Auth(Role.viewer())
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
  @GetDataDestinationSpec()
  async get(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<DataDestinationResponseApiDto> {
    const command = this.mapper.toGetCommand(id, context);
    const dataDestinationDto = await this.getService.run(command);
    return await this.mapper.toApiResponse(dataDestinationDto);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Delete(':id')
  @DeleteDataDestinationSpec()
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    const command = this.mapper.toDeleteCommand(id, context);
    await this.deleteService.run(command);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post(':id/rotate-secret-key')
  @RotateSecretKeySpec()
  async rotateSecretKey(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<DataDestinationResponseApiDto> {
    const command = this.mapper.toRotateSecretKeyCommand(id, context);
    const dataDestinationDto = await this.rotateSecretKeyService.run(command);
    return await this.mapper.toApiResponse(dataDestinationDto);
  }

  @Auth(Role.viewer())
  @Post(':id/oauth/authorize')
  @HttpCode(200)
  @OAuthAuthorizeSpec()
  async generateOAuthAuthorizationUrl(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() body: GenerateAuthorizationUrlRequestDto
  ): Promise<GenerateAuthorizationUrlResponseDto> {
    const command = this.mapper.toGenerateOAuthUrlCommand(context, body, id);
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

  @Auth(Role.viewer())
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

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Put(':id/availability')
  @HttpCode(204)
  async updateAvailability(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateDestinationAvailabilityApiDto
  ): Promise<void> {
    await this.updateSharingService.updateDestinationSharing(
      id,
      context.projectId,
      context.userId,
      context.roles ?? [],
      dto.availableForUse,
      dto.availableForMaintenance
    );
  }
}
