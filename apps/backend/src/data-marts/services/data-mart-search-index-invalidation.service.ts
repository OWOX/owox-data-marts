import { Injectable } from '@nestjs/common';
import { SearchableEntityType } from '../../common/search/search.facade';
import { AdvancedSearchIndexSyncService } from './advanced-search-index-sync.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

@Injectable()
export class DataMartSearchIndexInvalidationService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly indexSync: AdvancedSearchIndexSyncService
  ) {}

  async findInboundSourceDataMartIds(dataMartId: string, projectId: string): Promise<string[]> {
    return this.relationshipService.findSourceDataMartIdsByTargetDataMartId(dataMartId, projectId);
  }

  async scheduleDataMartSchemaChanged(dataMartId: string, projectId: string): Promise<void> {
    const inboundSourceIds = await this.findInboundSourceDataMartIds(dataMartId, projectId);
    await this.indexSync.scheduleReindexMany(
      SearchableEntityType.DATA_MART,
      uniqueIds([dataMartId, ...inboundSourceIds]),
      projectId
    );
  }

  async scheduleDataMartDeleted(
    dataMartId: string,
    projectId: string,
    inboundSourceIds: string[]
  ): Promise<void> {
    await this.indexSync.scheduleDelete(SearchableEntityType.DATA_MART, dataMartId, projectId);
    await this.indexSync.scheduleReindexMany(
      SearchableEntityType.DATA_MART,
      uniqueIds(inboundSourceIds.filter(id => id !== dataMartId)),
      projectId
    );
  }
}
