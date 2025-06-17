import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CreateDataStorageApiDto } from '../dto/presentation/create-data-storage-api.dto';
import { CreateDataStorageService } from '../use-cases/create-data-storage.service';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { UpdateDataStorageApiDto } from '../dto/presentation/update-data-storage-api.dto';
import { DataStorageResponseApiDto } from '../dto/presentation/data-storage-response-api.dto';
import { UpdateDataStorageService } from '../use-cases/update-data-storage.service';
import { GetDataStorageService } from '../use-cases/get-data-storage.service';
import { ListDataStoragesService } from '../use-cases/list-data-storages.service';

import {
  AuthContext,
  AuthorizationContext,
} from '../../common/authorization-context/authorization.context';
import {
  CreateDataStorageSpec,
  GetDataStorageSpec,
  ListDataStoragesSpec,
  UpdateDataStorageSpec,
} from './spec/data-storage.api';
import { ApiTags } from '@nestjs/swagger';
import { DataStorageListResponseApiDto } from '../dto/presentation/data-storage-list-response-api.dto';

@Controller('data-storages')
@ApiTags('DataStorages')
export class DataStorageController {
  constructor(
    private readonly updateService: UpdateDataStorageService,
    private readonly createService: CreateDataStorageService,
    private readonly getService: GetDataStorageService,
    private readonly listService: ListDataStoragesService,
    private readonly mapper: DataStorageMapper
  ) {}

  @Get()
  @ListDataStoragesSpec()
  async getAll(
    @AuthContext() context: AuthorizationContext
  ): Promise<DataStorageListResponseApiDto[]> {
    const dataStoragesDtos = await this.listService.run(context);
    return dataStoragesDtos.map(dto => this.mapper.toListItem(dto));
  }

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
}
