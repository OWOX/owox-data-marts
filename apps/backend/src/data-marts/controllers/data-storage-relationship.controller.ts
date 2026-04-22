import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, Role, Strategy } from '../../idp';
import { RelationshipResponseApiDto } from '../dto/presentation/relationship-response-api.dto';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { ListRelationshipsByStorageSpec } from './spec/data-storage-relationship.api';

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
