import { Injectable, NotFoundException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { GetRelationshipCommand } from '../dto/domain/get-relationship.command';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { ReportDataCacheService } from '../services/report-data-cache.service';

@Injectable()
export class DeleteDataMartRelationshipService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly reportDataCacheService: ReportDataCacheService
  ) {}

  @Transactional()
  async run(command: GetRelationshipCommand): Promise<void> {
    const relationship = await this.relationshipService.findById(command.relationshipId);

    if (!relationship || relationship.sourceDataMart.id !== command.sourceDataMartId) {
      throw new NotFoundException(
        `Relationship with ID ${command.relationshipId} not found for data mart ${command.sourceDataMartId}`
      );
    }

    await this.relationshipService.delete(relationship);
    await this.reportDataCacheService.invalidateByDataMartId(command.sourceDataMartId);
  }
}
