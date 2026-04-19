import { Injectable } from '@nestjs/common';
import { RelationshipResponseApiDto } from '../dto/presentation/relationship-response-api.dto';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class ListDataMartRelationshipsService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly mapper: RelationshipMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService
  ) {}

  async run(dataMartId: string): Promise<RelationshipResponseApiDto[]> {
    const relationships = await this.relationshipService.findBySourceDataMartId(dataMartId);

    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(relationships);

    return this.mapper.toResponseList(relationships, userProjectionsList);
  }
}
