import { Injectable, NotFoundException } from '@nestjs/common';
import { RelationshipResponseApiDto } from '../dto/presentation/relationship-response-api.dto';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class GetDataMartRelationshipService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly mapper: RelationshipMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService
  ) {}

  async run(id: string, dataMartId: string): Promise<RelationshipResponseApiDto> {
    const relationship = await this.relationshipService.findById(id);

    if (!relationship || relationship.sourceDataMart.id !== dataMartId) {
      throw new NotFoundException(
        `Relationship with ID ${id} not found for data mart ${dataMartId}`
      );
    }

    const createdByUser = await this.userProjectionsFetcherService.fetchCreatedByUser(relationship);

    return this.mapper.toResponse(relationship, createdByUser);
  }
}
