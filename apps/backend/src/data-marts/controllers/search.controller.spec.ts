jest.mock('../../idp', () => {
  const noop = () => () => undefined;
  return {
    Auth: noop,
    AuthContext: noop,
    Role: { viewer: () => ({ role: 'viewer', strategy: 'parse' }) },
    Strategy: { PARSE: 'parse', INTROSPECT: 'introspect' },
  };
});

import { BadRequestException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { SearchController } from './search.controller';
import {
  SEARCH_FACADE,
  SearchFacade,
  SearchableEntityType,
  SearchResult,
} from '../../common/search/search.facade';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import {
  DEFAULT_SEARCH_QUERY_MAX_LENGTH,
  DEFAULT_SEARCH_QUERY_MIN_LENGTH,
  SearchConfig,
} from '../search/config/search.config';

function makeContext(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return { projectId: 'proj-1', userId: 'user-1', ...overrides } as AuthorizationContext;
}

function buildController() {
  const searchResult: SearchResult[] = [
    {
      entityType: SearchableEntityType.DATA_MART,
      entityId: 'dm-1',
      title: 'Revenue',
      description: null,
      finalScore: 15,
      kwScore: 10,
      vecScore: null,
      extendability: 0,
    },
  ];

  const facade: jest.Mocked<SearchFacade> = {
    search: jest.fn().mockResolvedValue(searchResult),
  };

  const config: SearchConfig = {
    queryMaxLength: DEFAULT_SEARCH_QUERY_MAX_LENGTH,
    queryMinLength: DEFAULT_SEARCH_QUERY_MIN_LENGTH,
    topK: 25,
  };

  const controller = new SearchController(facade as unknown as SearchFacade, config);

  return { controller, facade };
}

describe('SearchController', () => {
  it('is mounted at the top-level /search path', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SearchController)).toBe('search');
  });

  it('returns search results from facade without checking an enterprise license', async () => {
    const { controller, facade } = buildController();

    const result = await controller.search(makeContext({ roles: ['viewer'] }), { q: 'revenue' });

    expect(facade.search).toHaveBeenCalledWith('proj-1', 'revenue', {
      topK: 25,
      entityTypes: undefined,
      accessScope: { userId: 'user-1', roles: ['viewer'] },
      excludeDrafts: undefined,
    });
    expect(result).toHaveLength(1);
    expect(result[0].entityId).toBe('dm-1');
  });

  it('passes limit, entityTypes, excludeDrafts and defaults roles to empty array', async () => {
    const { controller, facade } = buildController();

    await controller.search(makeContext(), {
      q: 'revenue',
      limit: 5,
      entityTypes: [SearchableEntityType.DATA_MART],
      excludeDrafts: true,
    });

    expect(facade.search).toHaveBeenCalledWith('proj-1', 'revenue', {
      topK: 5,
      entityTypes: [SearchableEntityType.DATA_MART],
      accessScope: { userId: 'user-1', roles: [] },
      excludeDrafts: true,
    });
  });

  it('trims the query before validating and searching', async () => {
    const { controller, facade } = buildController();

    await controller.search(makeContext(), { q: '  revenue  ' });

    expect(facade.search).toHaveBeenCalledWith('proj-1', 'revenue', expect.any(Object));
  });

  it('rejects queries shorter than the configured minimum after trimming', async () => {
    const { controller, facade } = buildController();

    await expect(controller.search(makeContext(), { q: ' r ' })).rejects.toThrow(
      BadRequestException
    );
    await expect(controller.search(makeContext(), { q: '   ' })).rejects.toThrow(
      BadRequestException
    );

    expect(facade.search).not.toHaveBeenCalled();
  });

  it('rejects queries longer than configured queryMaxLength before calling facade', async () => {
    const { controller, facade } = buildController();

    await expect(
      controller.search(makeContext(), {
        q: 'x'.repeat(DEFAULT_SEARCH_QUERY_MAX_LENGTH + 1),
      })
    ).rejects.toThrow(BadRequestException);

    expect(facade.search).not.toHaveBeenCalled();
  });

  it('SEARCH_FACADE is a symbol', () => {
    expect(typeof SEARCH_FACADE).toBe('symbol');
  });
});
