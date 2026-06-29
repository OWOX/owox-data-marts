import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { AUTH_HEADER, closeTestApp, createTestApp } from '@owox/test-utils';
import {
  SEARCH_FACADE,
  SearchFacade,
  SearchableEntityType,
  SearchResult,
} from '../src/common/search/search.facade';

jest.setTimeout(90_000);

describe('Search API (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let facade: jest.Mocked<SearchFacade>;

  const result: SearchResult = {
    entityType: SearchableEntityType.DATA_MART,
    entityId: 'dm-1',
    title: 'Revenue',
    description: null,
    finalScore: 90,
    kwScore: 80,
    vecScore: null,
    extendability: 0,
  };

  beforeAll(async () => {
    facade = {
      search: jest.fn().mockResolvedValue([result]),
    };

    const testApp = await createTestApp([{ provide: SEARCH_FACADE, useValue: facade }]);
    app = testApp.app;
    agent = testApp.agent;
  }, 90_000);

  afterAll(async () => {
    if (app) {
      await closeTestApp(app);
    }
  });

  beforeEach(() => {
    facade.search.mockClear();
    facade.search.mockResolvedValue([result]);
  });

  it('GET /api/search transforms query params and passes caller access scope', async () => {
    const response = await agent.get('/api/search').set(AUTH_HEADER).query({
      q: ' revenue ',
      limit: '5',
      entityTypes: SearchableEntityType.DATA_MART,
      excludeDrafts: 'true',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([result]);
    expect(facade.search).toHaveBeenCalledWith('0', 'revenue', {
      topK: 5,
      entityTypes: [SearchableEntityType.DATA_MART],
      accessScope: { userId: '0', roles: ['admin'] },
      excludeDrafts: true,
    });
  });

  it.each([
    ['excludeDrafts', { q: 'revenue', excludeDrafts: 'yes' }],
    ['entityTypes', { q: 'revenue', entityTypes: 'UNKNOWN' }],
    ['limit', { q: 'revenue', limit: '51' }],
  ])('GET /api/search rejects invalid %s before calling the facade', async (_name, query) => {
    const response = await agent.get('/api/search').set(AUTH_HEADER).query(query);

    expect(response.status).toBe(400);
    expect(facade.search).not.toHaveBeenCalled();
  });
});
