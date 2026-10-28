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
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, ViewOnlySafe } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { CreateDataStorageApiDto } from '../dto/presentation/create-data-storage-api.dto';
import { DataStorageAccessValidationResponseApiDto } from '../dto/presentation/data-storage-access-validation-response-api.dto';
import { DataStorageListResponseApiDto } from '../dto/presentation/data-storage-list-response-api.dto';
import { DataStorageResponseApiDto } from '../dto/presentation/data-storage-response-api.dto';
import { UpdateDataStorageApiDto } from '../dto/presentation/update-data-storage-api.dto';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { CreateDataStorageService } from '../use-cases/create-data-storage.service';
import { DeleteDataStorageService } from '../use-cases/delete-data-storage.service';
import { GetDataStorageService } from '../use-cases/get-data-storage.service';
import { ListDataStoragesService } from '../use-cases/list-data-storages.service';
import { UpdateDataStorageService } from '../use-cases/update-data-storage.service';
import { ValidateDataStorageAccessService } from '../use-cases/validate-data-storage-access.service';
import { ListDataStoragesByTypeService } from '../use-cases/list-data-storages-by-type.service';
import { ListStorageResourcesService } from '../use-cases/list-storage-resources.service';
import { UpdateAvailabilityService } from '../use-cases/update-availability.service';
import { UpdateStorageAvailabilityApiDto } from '../dto/presentation/update-availability-api.dto';
import { DataStorageByTypeResponseApiDto } from '../dto/presentation/data-storage-by-type-response-api.dto';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { OwnerFilter } from '../enums/owner-filter.enum';
import {
  CreateDataStorageSpec,
  DeleteDataStorageSpec,
  GetDataStorageSpec,
  ListDataStoragesSpec,
  ListDataStoragesByTypeSpec,
  ListStorageResourcesSpec,
  UpdateDataStorageSpec,
  ValidateDataStorageAccessSpec,
  UpdateStorageAvailabilitySpec,
} from './spec/data-storage.api';
import { ListStorageResourcesQueryDto } from '../dto/presentation/storage-resources/list-storage-resources-query.dto';
import { ListStorageResourcesResponseDto } from '../dto/presentation/storage-resources/list-storage-resources-response.dto';

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
    private readonly listByTypeService: ListDataStoragesByTypeService,
    private readonly listStorageResourcesService: ListStorageResourcesService,
    private readonly updateAvailabilityService: UpdateAvailabilityService
  ) {}

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
    const command = this.mapper.toByTypeCommand(context, type);
    const items = await this.listByTypeService.run(command);
    return this.mapper.toByTypeResponse(items);
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
  @Get(':id/resources')
  @ListStorageResourcesSpec()
  async listStorageResources(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Query() query: ListStorageResourcesQueryDto
  ): Promise<ListStorageResourcesResponseDto> {
    const command = this.mapper.toListStorageResourcesCommand(id, context, query);
    return this.listStorageResourcesService.run(command);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @ViewOnlySafe()
  @Post(':id/validate-access')
  @HttpCode(200)
  @ValidateDataStorageAccessSpec()
  async validate(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<DataStorageAccessValidationResponseApiDto> {
    const command = this.mapper.toValidateAccessCommand(id, context);
    const validationResult = await this.validateAccessService.run(command);
    return this.mapper.toValidateAccessResponse(validationResult);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @Put(':id/availability')
  @HttpCode(204)
  @UpdateStorageAvailabilitySpec()
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
