import { Injectable, NotFoundException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';

@Injectable()
export class UpdateDataMartRelationshipService {
  constructor(private readonly relationshipService: DataMartRelationshipService) {}

  @Transactional()
  async run(command: UpdateRelationshipCommand): Promise<DataMartRelationship> {
    const relationship = await this.relationshipService.findById(command.relationshipId);

    if (!relationship || relationship.sourceDataMart.id !== command.sourceDataMartId) {
      throw new NotFoundException(
        `Relationship with ID ${command.relationshipId} not found for data mart ${command.sourceDataMartId}`
      );
    }

    if (command.targetAlias !== undefined && command.targetAlias !== relationship.targetAlias) {
      await this.relationshipService.validateUniqueAlias(
        command.sourceDataMartId,
        command.targetAlias,
        command.relationshipId
      );
    }

    return this.relationshipService.update(relationship, command);
  }
}
