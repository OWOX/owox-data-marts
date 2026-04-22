import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import { RelationshipResponseApiDto } from '../dto/presentation/relationship-response-api.dto';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { ListRelationshipsByStorageService } from '../use-cases/list-relationships-by-storage.service';
import { ListRelationshipsByStorageSpec } from './spec/data-storage-relationship.api';

@Controller('data-storages/:storageId/relationships')
@ApiTags('Data Storage Relationships')
export class DataStorageRelationshipController {
  constructor(
    private readonly listService: ListRelationshipsByStorageService,
    private readonly mapper: RelationshipMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListRelationshipsByStorageSpec()
  async listByStorage(
    @AuthContext() context: AuthorizationContext,
    @Param('storageId') storageId: string
  ): Promise<RelationshipResponseApiDto[]> {
    const command = this.mapper.toListByStorageCommand(storageId, context);
    const result = await this.listService.run(command);
    return this.mapper.toResponseList(result);
  }
}
