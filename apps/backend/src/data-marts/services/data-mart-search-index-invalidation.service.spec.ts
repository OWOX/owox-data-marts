import { SearchableEntityType } from '../../common/search/search.facade';
import { AdvancedSearchIndexSyncService } from './advanced-search-index-sync.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartSearchIndexInvalidationService } from './data-mart-search-index-invalidation.service';

describe('DataMartSearchIndexInvalidationService', () => {
  let service: DataMartSearchIndexInvalidationService;
  let relationships: jest.Mocked<
    Pick<DataMartRelationshipService, 'findSourceDataMartIdsByTargetDataMartId'>
  >;
  let indexSync: jest.Mocked<
    Pick<AdvancedSearchIndexSyncService, 'scheduleReindexMany' | 'scheduleDelete'>
  >;

  beforeEach(() => {
    relationships = {
      findSourceDataMartIdsByTargetDataMartId: jest.fn().mockResolvedValue([]),
    };
    indexSync = {
      scheduleReindexMany: jest.fn().mockResolvedValue(undefined),
      scheduleDelete: jest.fn().mockResolvedValue(undefined),
    };

    service = new DataMartSearchIndexInvalidationService(
      relationships as unknown as DataMartRelationshipService,
      indexSync as unknown as AdvancedSearchIndexSyncService
    );
  });

  it('reindexes the changed data mart and inbound first-level source data marts on schema change', async () => {
    relationships.findSourceDataMartIdsByTargetDataMartId.mockResolvedValue([
      'source-1',
      'target-1',
      'source-2',
      'source-1',
    ]);

    await service.scheduleDataMartSchemaChanged('target-1', 'project-1');

    expect(relationships.findSourceDataMartIdsByTargetDataMartId).toHaveBeenCalledWith(
      'target-1',
      'project-1'
    );
    expect(indexSync.scheduleReindexMany).toHaveBeenCalledWith(
      SearchableEntityType.DATA_MART,
      ['target-1', 'source-1', 'source-2'],
      'project-1'
    );
  });

  it('deletes the removed data mart index and reindexes only affected inbound sources', async () => {
    await service.scheduleDataMartDeleted('target-1', 'project-1', [
      'source-1',
      'target-1',
      'source-2',
      'source-1',
    ]);

    expect(indexSync.scheduleDelete).toHaveBeenCalledWith(
      SearchableEntityType.DATA_MART,
      'target-1',
      'project-1'
    );
    expect(indexSync.scheduleReindexMany).toHaveBeenCalledWith(
      SearchableEntityType.DATA_MART,
      ['source-1', 'source-2'],
      'project-1'
    );
  });
});
