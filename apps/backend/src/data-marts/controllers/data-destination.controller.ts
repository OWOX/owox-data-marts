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
import { OwnerFilter } from '../enums/owner-filter.enum';
import { CreateDataDestinationApiDto } from '../dto/presentation/create-data-destination-api.dto';
import { CreateConnectGoogleSheetsDestinationApiDto } from '../dto/presentation/create-connect-google-sheets-destination-api.dto';
import { CreateDataDestinationService } from '../use-cases/create-data-destination.service';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { UpdateDataDestinationApiDto } from '../dto/presentation/update-data-destination-api.dto';
import { DataDestinationResponseApiDto } from '../dto/presentation/data-destination-response-api.dto';
import { UpdateDataDestinationService } from '../use-cases/update-data-destination.service';
import { GetDataDestinationService } from '../use-cases/get-data-destination.service';
import { ListDataDestinationsService } from '../use-cases/list-data-destinations.service';
import { ListDataDestinationsByTypeService } from '../use-cases/list-data-destinations-by-type.service';
import { ResolveExcelDestinationService } from '../use-cases/resolve-excel-destination.service';
import { ResolveExcelDestinationCommand } from '../dto/domain/resolve-excel-destination.command';
import { DataDestinationByTypeResponseApiDto } from '../dto/presentation/data-destination-by-type-response-api.dto';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import {
  Auth,
  AuthContext,
  AuthorizationContext,
  RejectApiKeyAuth,
  RejectPluginAuth,
} from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { GoogleOAuthSettingsResponseDto } from '../dto/presentation/google-oauth/oauth-settings-response.dto';

import {
  CreateDataDestinationSpec,
  CreateConnectGoogleSheetsDestinationSpec,
  ResolveExcelDestinationSpec,
  DeleteDataDestinationSpec,
  GetDataDestinationImpactSpec,
  GetDataDestinationSpec,
  ListDataDestinationsSpec,
  ListDataDestinationsByTypeSpec,
  RotateSecretKeySpec,
  UpdateDataDestinationSpec,
  OAuthSettingsSpec,
  UpdateDataDestinationAvailabilitySpec,
  CreateGoogleSheetDocumentSpec,
} from './spec/data-destination.api';
import { ApiTags } from '@nestjs/swagger';
import { DeleteDataDestinationService } from '../use-cases/delete-data-destination.service';
import { GetDataDestinationImpactService } from '../use-cases/get-data-destination-impact.service';
import { DataDestinationImpactResponseApiDto } from '../dto/presentation/data-destination-impact-response-api.dto';
import { RotateSecretKeyService } from '../use-cases/rotate-secret-key.service';
import { GoogleOAuthFlowService } from '../services/google-oauth/google-oauth-flow.service';
import { UpdateAvailabilityService } from '../use-cases/update-availability.service';
import { UpdateDestinationAvailabilityApiDto } from '../dto/presentation/update-availability-api.dto';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { CreateGoogleSheetDocumentService } from '../use-cases/google-sheets/create-google-sheet-document.service';
import { CreateGoogleSheetDocumentCommand } from '../dto/domain/google-sheets/create-google-sheet-document.command';
import { CreateGoogleSheetDocumentRequestDto } from '../dto/presentation/google-sheets/create-google-sheet-document-request.dto';
import { CreateGoogleSheetDocumentResponseDto } from '../dto/presentation/google-sheets/create-google-sheet-document-response.dto';

@Controller('data-destinations')
@ApiTags('DataDestinations')
export class DataDestinationController {
  constructor(
    private readonly createService: CreateDataDestinationService,
    private readonly updateService: UpdateDataDestinationService,
    private readonly getService: GetDataDestinationService,
    private readonly listService: ListDataDestinationsService,
    private readonly deleteService: DeleteDataDestinationService,
    private readonly getImpactService: GetDataDestinationImpactService,
    private readonly rotateSecretKeyService: RotateSecretKeyService,
    private readonly mapper: DataDestinationMapper,
    private readonly googleOAuthFlowService: GoogleOAuthFlowService,
    private readonly listByTypeService: ListDataDestinationsByTypeService,
    private readonly resolveExcelService: ResolveExcelDestinationService,
    private readonly updateAvailabilityService: UpdateAvailabilityService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly createGoogleSheetDocumentService: CreateGoogleSheetDocumentService
  ) {}

  private async checkDestinationAccess(
    id: string,
    context: AuthorizationContext,
    action: Action
  ): Promise<void> {
    if (!context.userId) return;
    const allowed = await this.accessDecisionService.canAccess(
      context.userId,
      context.roles ?? [],
      EntityType.DESTINATION,
      id,
      action,
      context.projectId
    );
    if (!allowed) {
      throw new ForbiddenException('You do not have access to this Destination');
    }
  }

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

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @RejectApiKeyAuth()
  @RejectPluginAuth()
  @Post('connect/google-sheets')
  @CreateConnectGoogleSheetsDestinationSpec()
  async createConnectGoogleSheets(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: CreateConnectGoogleSheetsDestinationApiDto
  ): Promise<DataDestinationResponseApiDto> {
    const command = this.mapper.toConnectGoogleSheetsCreateCommand(context, dto);
    const dataDestinationDto = await this.createService.run(command);
    return await this.mapper.toApiResponse(dataDestinationDto);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post('excel')
  @HttpCode(200)
  @ResolveExcelDestinationSpec()
  async resolveExcel(
    @AuthContext() context: AuthorizationContext
  ): Promise<DataDestinationResponseApiDto> {
    const command = new ResolveExcelDestinationCommand(
      context.projectId,
      context.userId,
      context.roles
    );
    const dataDestinationDto = await this.resolveExcelService.run(command);
    return await this.mapper.toApiResponse(dataDestinationDto);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get('by-type/:type')
  @ListDataDestinationsByTypeSpec()
  async getByType(
    @AuthContext() context: AuthorizationContext,
    @Param('type', new ParseEnumPipe(DataDestinationType)) type: DataDestinationType
  ): Promise<DataDestinationByTypeResponseApiDto[]> {
    const command = this.mapper.toByTypeCommand(context, type);
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

  // --- Declared before the parameterized :id routes ---

  @Auth(Role.viewer())
  @RejectApiKeyAuth()
  @RejectPluginAuth()
  @Get('oauth/settings')
  @OAuthSettingsSpec()
  async getOAuthSettings(): Promise<GoogleOAuthSettingsResponseDto> {
    return this.googleOAuthFlowService.getSettingsForType('destination');
  }

  // --- Parameterized :id routes ---

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':id')
  @GetDataDestinationSpec()
  async get(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<DataDestinationResponseApiDto> {
    await this.checkDestinationAccess(id, context, Action.SEE);
    const command = this.mapper.toGetCommand(id, context);
    const dataDestinationDto = await this.getService.run(command);
    return await this.mapper.toApiResponse(dataDestinationDto);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Get(':id/impact')
  @GetDataDestinationImpactSpec()
  async getImpact(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<DataDestinationImpactResponseApiDto> {
    await this.checkDestinationAccess(id, context, Action.DELETE);
    const impact = await this.getImpactService.run(id, context.projectId);
    return {
      destinationId: impact.destinationId,
      destinationTitle: impact.destinationTitle,
      reportsCount: impact.reportsCount,
      dataMartCount: impact.dataMartCount,
    };
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Delete(':id')
  @DeleteDataDestinationSpec()
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    await this.checkDestinationAccess(id, context, Action.DELETE);
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
    await this.checkDestinationAccess(id, context, Action.EDIT);
    const command = this.mapper.toRotateSecretKeyCommand(id, context);
    const dataDestinationDto = await this.rotateSecretKeyService.run(command);
    return await this.mapper.toApiResponse(dataDestinationDto);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Put(':id/availability')
  @HttpCode(204)
  @UpdateDataDestinationAvailabilitySpec()
  async updateAvailability(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateDestinationAvailabilityApiDto
  ): Promise<void> {
    await this.updateAvailabilityService.updateDestinationSharing(
      id,
      context.projectId,
      context.userId,
      context.roles ?? [],
      dto.availableForUse,
      dto.availableForMaintenance
    );
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Post(':id/google-sheets/documents')
  @HttpCode(200)
  @CreateGoogleSheetDocumentSpec()
  async createGoogleSheetDocument(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: CreateGoogleSheetDocumentRequestDto
  ): Promise<CreateGoogleSheetDocumentResponseDto> {
    await this.checkDestinationAccess(id, context, Action.USE);
    const command = new CreateGoogleSheetDocumentCommand(
      id,
      context.projectId,
      dto.title,
      context.userId,
      context.email
    );
    return this.createGoogleSheetDocumentService.run(command);
  }
}
