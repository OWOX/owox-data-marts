import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthContext, AuthorizationContext, Auth } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { CreateRelationshipRequestApiDto } from '../dto/presentation/create-relationship-request-api.dto';
import { UpdateRelationshipRequestApiDto } from '../dto/presentation/update-relationship-request-api.dto';
import { RelationshipResponseApiDto } from '../dto/presentation/relationship-response-api.dto';
import { CreateDataMartRelationshipService } from '../use-cases/create-data-mart-relationship.service';
import { UpdateDataMartRelationshipService } from '../use-cases/update-data-mart-relationship.service';
import { DeleteDataMartRelationshipService } from '../use-cases/delete-data-mart-relationship.service';
import { ListDataMartRelationshipsService } from '../use-cases/list-data-mart-relationships.service';
import { GetDataMartRelationshipService } from '../use-cases/get-data-mart-relationship.service';
import {
  CreateRelationshipSpec,
  ListRelationshipsByDataMartSpec,
  GetRelationshipSpec,
  UpdateRelationshipSpec,
  DeleteRelationshipSpec,
} from './spec/data-mart-relationship.api';

@Controller('data-marts/:dataMartId/relationships')
@ApiTags('Data Mart Relationships')
export class DataMartRelationshipController {
  constructor(
    private readonly createService: CreateDataMartRelationshipService,
    private readonly updateService: UpdateDataMartRelationshipService,
    private readonly deleteService: DeleteDataMartRelationshipService,
    private readonly listService: ListDataMartRelationshipsService,
    private readonly getService: GetDataMartRelationshipService,
    private readonly mapper: RelationshipMapper
  ) {}

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Post()
  @CreateRelationshipSpec()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Body() dto: CreateRelationshipRequestApiDto
  ): Promise<RelationshipResponseApiDto> {
    const command = this.mapper.toCreateCommand(dataMartId, context, dto);
    const relationship = await this.createService.run(command);
    return this.mapper.toResponse(relationship);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListRelationshipsByDataMartSpec()
  async list(@Param('dataMartId') dataMartId: string): Promise<RelationshipResponseApiDto[]> {
    return this.listService.run(dataMartId);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get(':id')
  @GetRelationshipSpec()
  async get(
    @Param('dataMartId') dataMartId: string,
    @Param('id') id: string
  ): Promise<RelationshipResponseApiDto> {
    return this.getService.run(id, dataMartId);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Patch(':id')
  @UpdateRelationshipSpec()
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRelationshipRequestApiDto
  ): Promise<RelationshipResponseApiDto> {
    const command = this.mapper.toUpdateCommand(id, dataMartId, context, dto);
    const relationship = await this.updateService.run(command);
    return this.mapper.toResponse(relationship);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Delete(':id')
  @DeleteRelationshipSpec()
  async remove(
    @AuthContext() context: AuthorizationContext,
    @Param('dataMartId') dataMartId: string,
    @Param('id') id: string
  ): Promise<void> {
    const command = this.mapper.toGetCommand(id, dataMartId, context);
    await this.deleteService.run(command);
  }
}
