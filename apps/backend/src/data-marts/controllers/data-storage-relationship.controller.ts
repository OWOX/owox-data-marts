import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '../../idp';
import { Role, Strategy } from '../../idp/types/role-config.types';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { RelationshipResponseApiDto } from '../dto/presentation/relationship-response-api.dto';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { ListRelationshipsByStorageSpec } from './spec/data-mart-relationship.api';

@Controller('data-storages/:storageId/relationships')
@ApiTags('Data Storage Relationships')
export class DataStorageRelationshipController {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly mapper: RelationshipMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListRelationshipsByStorageSpec()
  async listByStorage(
    @Param('storageId') storageId: string
  ): Promise<RelationshipResponseApiDto[]> {
    const relationships = await this.relationshipService.findByStorageId(storageId);
    return this.mapper.toResponseList(relationships);
  }
}
