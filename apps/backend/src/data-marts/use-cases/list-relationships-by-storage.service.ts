import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ListRelationshipsByStorageCommand } from '../dto/domain/list-relationships-by-storage.command';
import { RelationshipDto } from '../dto/domain/relationship.dto';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataStorageService } from '../services/data-storage.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class ListRelationshipsByStorageService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataStorageService: DataStorageService,
    private readonly mapper: RelationshipMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: ListRelationshipsByStorageCommand): Promise<RelationshipDto[]> {
    if (!command.userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    await this.dataStorageService.getByProjectIdAndId(command.projectId, command.storageId);

    const canSee = await this.accessDecisionService.canAccess(
      command.userId,
      command.roles,
      EntityType.STORAGE,
      command.storageId,
      Action.SEE,
      command.projectId
    );
    if (!canSee) {
      throw new ForbiddenException('You do not have access to this Storage');
    }

    const relationships = await this.relationshipService.findByStorageId(
      command.storageId,
      command.projectId
    );

    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(relationships);

    return this.mapper.toDomainDtoList(relationships, userProjectionsList);
  }
}
