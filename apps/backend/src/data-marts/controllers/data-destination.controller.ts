import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { CreateDataDestinationApiDto } from '../dto/presentation/create-data-destination-api.dto';
import { CreateDataDestinationService } from '../use-cases/create-data-destination.service';
import { DataDestinationMapper } from '../mappers/data-destination.mapper';
import { UpdateDataDestinationApiDto } from '../dto/presentation/update-data-destination-api.dto';
import { DataDestinationResponseApiDto } from '../dto/presentation/data-destination-response-api.dto';
import { UpdateDataDestinationService } from '../use-cases/update-data-destination.service';
import { GetDataDestinationService } from '../use-cases/get-data-destination.service';
import { ListDataDestinationsService } from '../use-cases/list-data-destinations.service';
import { Auth, AuthContext, AuthorizationContext } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';

import {
  CreateDataDestinationSpec,
  DeleteDataDestinationSpec,
  GetDataDestinationSpec,
  ListDataDestinationsSpec,
  RotateSecretKeySpec,
  UpdateDataDestinationSpec,
} from './spec/data-destination.api';
import { ApiTags } from '@nestjs/swagger';
import { DeleteDataDestinationService } from '../use-cases/delete-data-destination.service';
import { RotateSecretKeyService } from '../use-cases/rotate-secret-key.service';

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
    private readonly mapper: DataDestinationMapper
  ) {}

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post()
  @CreateDataDestinationSpec()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: CreateDataDestinationApiDto
  ): Promise<DataDestinationResponseApiDto> {
    const command = this.mapper.toCreateCommand(context, dto);
    const dataDestinationDto = await this.createService.run(command);
    return this.mapper.toApiResponse(dataDestinationDto);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put(':id')
  @UpdateDataDestinationSpec()
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateDataDestinationApiDto
  ): Promise<DataDestinationResponseApiDto> {
    const command = this.mapper.toUpdateCommand(id, context, dto);
    const dataDestinationDto = await this.updateService.run(command);
    return this.mapper.toApiResponse(dataDestinationDto);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':id')
  @GetDataDestinationSpec()
  async get(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<DataDestinationResponseApiDto> {
    const command = this.mapper.toGetCommand(id, context);
    const dataDestinationDto = await this.getService.run(command);
    return this.mapper.toApiResponse(dataDestinationDto);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListDataDestinationsSpec()
  async getAll(
    @AuthContext() context: AuthorizationContext
  ): Promise<DataDestinationResponseApiDto[]> {
    const command = this.mapper.toListCommand(context);
    const dataDestinationsDto = await this.listService.run(command);
    return this.mapper.toResponseList(dataDestinationsDto);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Delete(':id')
  @DeleteDataDestinationSpec()
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    const command = this.mapper.toDeleteCommand(id, context);
    await this.deleteService.run(command);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post(':id/rotate-secret-key')
  @RotateSecretKeySpec()
  async rotateSecretKey(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<DataDestinationResponseApiDto> {
    const command = this.mapper.toRotateSecretKeyCommand(id, context);
    const dataDestinationDto = await this.rotateSecretKeyService.run(command);
    return this.mapper.toApiResponse(dataDestinationDto);
  }
}
