import { Test, TestingModule } from '@nestjs/testing';
import { AdvancedSearchFacadeImpl } from './advanced-search.facade.impl';
import { AdvancedSearchService } from '../search/advanced-search.service';
import { SearchIndexerService } from '../indexing/search-indexer.service';
import { SearchableEntityType } from '../../../common/ee-contracts/advanced-search.facade';

describe('AdvancedSearchFacadeImpl', () => {
  let facade: AdvancedSearchFacadeImpl;
  let searchService: jest.Mocked<Pick<AdvancedSearchService, 'search'>>;
  let indexerService: jest.Mocked<Pick<SearchIndexerService, 'reindexDataMart'>>;

  beforeEach(async () => {
    searchService = { search: jest.fn().mockResolvedValue([]) };
    indexerService = { reindexDataMart: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvancedSearchFacadeImpl,
        { provide: AdvancedSearchService, useValue: searchService },
        { provide: SearchIndexerService, useValue: indexerService },
      ],
    }).compile();

    facade = module.get(AdvancedSearchFacadeImpl);
  });

  describe('search', () => {
    it('delegates to AdvancedSearchService with provided options', async () => {
      const expected = [
        {
          entityType: SearchableEntityType.DATA_MART,
          entityId: 'dm-1',
          title: 'T',
          description: null,
          finalScore: 10,
          kwScore: 10,
          vecScore: null,
          extendability: 0,
        },
      ];
      searchService.search.mockResolvedValue(expected);

      const options = { topK: 5 };
      const result = await facade.search('proj-1', 'query', options);

      expect(searchService.search).toHaveBeenCalledWith('proj-1', 'query', options);
      expect(result).toBe(expected);
    });

    it('delegates to AdvancedSearchService without options (uses default)', async () => {
      await facade.search('proj-1', 'query');

      expect(searchService.search).toHaveBeenCalledWith('proj-1', 'query', undefined);
    });
  });

  describe('reindexDataMart', () => {
    it('delegates to SearchIndexerService', async () => {
      await facade.reindexDataMart('dm-42');

      expect(indexerService.reindexDataMart).toHaveBeenCalledWith('dm-42');
    });
  });
});
