import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CreateDataStorageApiDto } from '../dto/presentation/create-data-storage-api.dto';
import { CreateDataStorageService } from '../use-cases/create-data-storage.service';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import { UpdateDataStorageApiDto } from '../dto/presentation/update-data-storage-api.dto';
import { DataStorageResponseApiDto } from '../dto/presentation/data-storage-response-api.dto';
import { UpdateDataStorageService } from '../use-cases/update-data-storage.service';
import { GetDataStorageService } from '../use-cases/get-data-storage.service';
import {
  AuthContext,
  AuthorizationContext,
} from '../../common/authorization-context/authorization.context';
import {
  CreateDataStorageSpec,
  GetDataStorageSpec,
  UpdateDataStorageSpec,
} from './spec/data-storage.api';
import { ApiTags } from '@nestjs/swagger';

@Controller('data-storages')
@ApiTags('DataStorages')
export class DataStorageController {
  constructor(
    private readonly updateService: UpdateDataStorageService,
    private readonly createService: CreateDataStorageService,
    private readonly getService: GetDataStorageService,
    private readonly mapper: DataStorageMapper
  ) {}

  @Put(':id')
  @UpdateDataStorageSpec()
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateDataStorageApiDto
  ): Promise<DataStorageResponseApiDto> {
    const command = this.mapper.toUpdateCommand(dto);
    const dataStorageDto = await this.updateService.run(context.projectId, id, command);
    return this.mapper.toApiResponse(dataStorageDto);
  }

  @Post()
  @CreateDataStorageSpec()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: CreateDataStorageApiDto
  ): Promise<DataStorageResponseApiDto> {
    const command = this.mapper.toCreateCommand(dto);
    const dataStorageDto = await this.createService.run(context.projectId, command);
    return this.mapper.toApiResponse(dataStorageDto);
  }

  @Get(':id')
  @GetDataStorageSpec()
  async get(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<DataStorageResponseApiDto> {
    const dataStorageDto = await this.getService.run(context.projectId, id);
    return this.mapper.toApiResponse(dataStorageDto);
  }
}
