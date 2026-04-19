import { Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { RelationshipResponseApiDto } from '../dto/presentation/relationship-response-api.dto';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class CreateDataMartRelationshipService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: RelationshipMapper
  ) {}

  @Transactional()
  async run(command: CreateRelationshipCommand): Promise<RelationshipResponseApiDto> {
    this.relationshipService.validateNoSelfReference(
      command.sourceDataMartId,
      command.targetDataMartId
    );

    const [sourceDataMart, targetDataMart] = await Promise.all([
      this.dataMartService.getByIdAndProjectId(command.sourceDataMartId, command.projectId),
      this.dataMartService.getByIdAndProjectId(command.targetDataMartId, command.projectId),
    ]);

    this.relationshipService.validateSameStorage(
      sourceDataMart.storage.id,
      targetDataMart.storage.id
    );

    await this.relationshipService.validateUniqueAlias(
      command.sourceDataMartId,
      command.targetAlias
    );

    const hasCycle = await this.relationshipService.detectCycles(
      command.sourceDataMartId,
      command.targetDataMartId,
      sourceDataMart.storage.id
    );

    if (hasCycle) {
      throw new BusinessViolationException(
        'Adding this relationship would create a circular reference between data marts',
        {
          sourceDataMartId: command.sourceDataMartId,
          targetDataMartId: command.targetDataMartId,
        }
      );
    }

    this.relationshipService.validateJoinFieldTypes(
      sourceDataMart.schema,
      targetDataMart.schema,
      command.joinConditions
    );

    const relationship = await this.relationshipService.create(command, sourceDataMart);
    const createdByUser = await this.userProjectionsFetcherService.fetchCreatedByUser(relationship);
    return this.mapper.toResponse(relationship, createdByUser);
  }
}
