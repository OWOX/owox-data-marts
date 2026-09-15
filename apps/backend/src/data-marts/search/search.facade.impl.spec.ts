import type { PublicOriginService } from '../../common/config/public-origin.service';
import {
  SearchableEntityType,
  type SearchEngine,
  type SearchOptions,
  type SearchResult,
} from '../../common/search/search.facade';
import { SearchFacadeImpl } from './search.facade.impl';

describe('SearchFacadeImpl', () => {
  const options: SearchOptions = { accessScope: { userId: 'u-1', roles: ['viewer'] } };
  const engine: jest.Mocked<SearchEngine> = { search: jest.fn() };
  const publicOrigin = {
    getPublicOrigin: jest.fn(() => 'https://app.owox.com/'),
  } as unknown as jest.Mocked<PublicOriginService>;
  const facade = new SearchFacadeImpl(engine, publicOrigin);

  function result(overrides: Partial<SearchResult>): SearchResult {
    return {
      entityType: SearchableEntityType.DATA_MART,
      entityId: 'dm-1',
      title: 'Orders',
      description: null,
      finalScore: 90,
      kwScore: 80,
      vecScore: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    engine.search.mockReset();
  });

  it('delegates the search to the engine unchanged', async () => {
    engine.search.mockResolvedValue([]);

    await facade.search('proj-1', 'revenue', options);

    expect(engine.search).toHaveBeenCalledWith('proj-1', 'revenue', options);
  });

  it('adds the canonical direct URL to report results', async () => {
    engine.search.mockResolvedValue([
      result({
        entityType: SearchableEntityType.REPORT,
        entityId: 'rep-1',
        report: {
          dataMart: { id: 'dm 1', title: 'Orders' },
          dataDestination: { id: 'dd-1', title: 'Sheets', type: 'GOOGLE_SHEETS' },
        },
      }),
    ]);

    const [report] = await facade.search('proj/1', 'revenue', options);

    expect(report.url).toBe(
      'https://app.owox.com/ui/proj%2F1/data-marts/dm%201/reports?reportId=rep-1'
    );
  });

  it('leaves other entity types without a URL', async () => {
    engine.search.mockResolvedValue([result({})]);

    const [dataMart] = await facade.search('proj-1', 'revenue', options);

    expect(dataMart).not.toHaveProperty('url');
  });
});
