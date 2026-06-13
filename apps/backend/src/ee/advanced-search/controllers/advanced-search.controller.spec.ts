jest.mock('../../../idp', () => {
  const noop = () => () => undefined;
  return {
    Auth: noop,
    AuthContext: noop,
    Role: { viewer: () => ({ role: 'viewer', strategy: 'parse' }) },
    Strategy: { PARSE: 'parse', INTROSPECT: 'introspect' },
  };
});

import { ForbiddenException } from '@nestjs/common';
import { AdvancedSearchController } from './advanced-search.controller';
import {
  ADVANCED_SEARCH_FACADE,
  AdvancedSearchFacade,
  SearchableEntityType,
  SearchResult,
} from '../../../common/ee-contracts/advanced-search.facade';
import { EeLicenseService } from '../../shared/ee-license.service';
import type { AuthorizationContext } from '../../../idp/types/auth.types';

function makeContext(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return { projectId: 'proj-1', userId: 'user-1', ...overrides } as AuthorizationContext;
}

function buildController(opts: { licensed: boolean }) {
  const searchResult: SearchResult[] = [
    {
      entityType: SearchableEntityType.DATA_MART,
      entityId: 'dm-1',
      title: 'Revenue',
      description: null,
      finalScore: 15,
      kwScore: 10,
      vecScore: 90,
      extendability: 5,
    },
  ];

  const facade: jest.Mocked<AdvancedSearchFacade> = {
    search: jest.fn().mockResolvedValue(searchResult),
    reindexDataMart: jest.fn().mockResolvedValue(undefined),
  };

  const eeLicense = {
    isLicensed: jest.fn().mockReturnValue(opts.licensed),
    verifyLicensed: jest.fn().mockImplementation(() => {
      if (!opts.licensed) throw new ForbiddenException('Enterprise license required');
    }),
  };

  const controller = new AdvancedSearchController(
    facade as unknown as AdvancedSearchFacade,
    eeLicense as unknown as EeLicenseService
  );

  return { controller, facade, eeLicense };
}

describe('AdvancedSearchController', () => {
  describe('GET advanced-search (licensed)', () => {
    it('returns search results from facade', async () => {
      const { controller, facade } = buildController({ licensed: true });

      const result = await controller.search(makeContext({ roles: ['viewer'] }), { q: 'revenue' });

      expect(facade.search).toHaveBeenCalledWith('proj-1', 'revenue', {
        topK: undefined,
        entityTypes: undefined,
        accessScope: { userId: 'user-1', roles: ['viewer'] },
      });
      expect(result).toHaveLength(1);
      expect(result[0].entityId).toBe('dm-1');
      expect(result[0].entityType).toBe(SearchableEntityType.DATA_MART);
    });

    it('passes limit and entityTypes through, defaults roles to empty array', async () => {
      const { controller, facade } = buildController({ licensed: true });

      await controller.search(makeContext(), {
        q: 'revenue',
        limit: 5,
        entityTypes: [SearchableEntityType.DATA_MART],
      });

      expect(facade.search).toHaveBeenCalledWith('proj-1', 'revenue', {
        topK: 5,
        entityTypes: [SearchableEntityType.DATA_MART],
        accessScope: { userId: 'user-1', roles: [] },
      });
    });
  });

  describe('GET advanced-search (unlicensed)', () => {
    it('throws ForbiddenException', async () => {
      const { controller } = buildController({ licensed: false });

      await expect(controller.search(makeContext(), { q: 'revenue' })).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('token registration', () => {
    it('ADVANCED_SEARCH_FACADE is a symbol', () => {
      expect(typeof ADVANCED_SEARCH_FACADE).toBe('symbol');
    });
  });
});
