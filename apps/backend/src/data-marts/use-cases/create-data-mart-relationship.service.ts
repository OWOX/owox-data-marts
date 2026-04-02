import { Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';

@Injectable()
export class CreateDataMartRelationshipService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService
  ) {}

  @Transactional()
  async run(command: CreateRelationshipCommand): Promise<DataMartRelationship> {
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

    return this.relationshipService.create(command, sourceDataMart);
  }
}
