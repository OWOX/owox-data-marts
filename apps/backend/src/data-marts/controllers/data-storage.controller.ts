import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { CreateDataStorageApiDto } from '../dto/presentation/create-data-storage-api.dto';
import { DataStorageAccessValidationResponseApiDto } from '../dto/presentation/data-storage-access-validation-response-api.dto';
import { DataStorageListResponseApiDto } from '../dto/presentation/data-storage-list-response-api.dto';
import { DataStorageResponseApiDto } from '../dto/presentation/data-storage-response-api.dto';
import { PublishDataStorageDraftsResponseApiDto } from '../dto/presentation/publish-data-storage-drafts-response-api.dto';
import { UpdateDataStorageApiDto } from '../dto/presentation/update-data-storage-api.dto';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { CreateDataStorageService } from '../use-cases/create-data-storage.service';
import { DeleteDataStorageService } from '../use-cases/delete-data-storage.service';
import { GetDataStorageService } from '../use-cases/get-data-storage.service';
import { ListDataStoragesService } from '../use-cases/list-data-storages.service';
import { PublishDataStorageDraftsService } from '../use-cases/publish-data-storage-drafts.service';
import { UpdateDataStorageService } from '../use-cases/update-data-storage.service';
import { ValidateDataStorageAccessService } from '../use-cases/validate-data-storage-access.service';
import {
  CreateDataStorageSpec,
  DeleteDataStorageSpec,
  GetDataStorageSpec,
  ListDataStoragesSpec,
  PublishDataStorageDraftsSpec,
  UpdateDataStorageSpec,
  ValidateDataStorageAccessSpec,
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
    private readonly publishDraftsService: PublishDataStorageDraftsService,
    private readonly mapper: DataStorageMapper
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

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post(':id/publish-drafts')
  @PublishDataStorageDraftsSpec()
  async publishDrafts(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<PublishDataStorageDraftsResponseApiDto> {
    const command = this.mapper.toPublishDraftsCommand(id, context);
    const result = await this.publishDraftsService.run(command);
    return this.mapper.toPublishDraftsResponse(result);
  }
}
