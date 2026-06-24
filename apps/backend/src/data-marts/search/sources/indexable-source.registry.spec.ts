import { Test } from '@nestjs/testing';
import { IndexableSourceRegistry } from './indexable-source.registry';
import { INDEXABLE_SOURCES, type IndexableSource } from './indexable-source.port';
import { SearchableEntityType } from '../../../common/search/search.facade';
import { DATA_MART_SCORING_CONFIG } from '../engine/scoring-config';

function makeSource(entityType: SearchableEntityType): IndexableSource {
  return {
    entityType,
    scoringConfig: DATA_MART_SCORING_CONFIG,
    accessPredicateProvider: {
      build: jest.fn().mockResolvedValue({ joinSql: '', whereSql: '', parameters: {} }),
    },
    listSearchablePage: jest.fn().mockResolvedValue({ descriptors: [], nextCursor: null }),
    listProjectIds: jest.fn().mockResolvedValue([]),
    loadSearchableOne: jest.fn().mockResolvedValue(null),
  };
}

describe('IndexableSourceRegistry', () => {
  describe('with a single DATA_MART source', () => {
    let registry: IndexableSourceRegistry;
    let dataMartSource: IndexableSource;

    beforeEach(async () => {
      dataMartSource = makeSource(SearchableEntityType.DATA_MART);
      const module = await Test.createTestingModule({
        providers: [
          IndexableSourceRegistry,
          { provide: INDEXABLE_SOURCES, useValue: [dataMartSource] },
        ],
      }).compile();
      registry = module.get(IndexableSourceRegistry);
    });

    it('all() returns all registered sources', () => {
      expect(registry.all()).toHaveLength(1);
      expect(registry.all()[0]).toBe(dataMartSource);
    });

    it('resolve() returns the source for a registered entity type', () => {
      expect(registry.resolve(SearchableEntityType.DATA_MART)).toBe(dataMartSource);
    });

    it('resolve() returns undefined for an unregistered entity type', () => {
      expect(registry.resolve('UNKNOWN' as SearchableEntityType)).toBeUndefined();
    });

    it('has() returns true for a registered entity type', () => {
      expect(registry.has(SearchableEntityType.DATA_MART)).toBe(true);
    });

    it('has() returns false for an unregistered entity type', () => {
      expect(registry.has('UNKNOWN' as SearchableEntityType)).toBe(false);
    });
  });

  describe('with multiple sources', () => {
    let registry: IndexableSourceRegistry;
    let sourceA: IndexableSource;
    let sourceB: IndexableSource;

    beforeEach(async () => {
      sourceA = makeSource(SearchableEntityType.DATA_MART);
      sourceB = {
        ...makeSource('OTHER' as SearchableEntityType),
        entityType: 'OTHER' as SearchableEntityType,
      };
      const module = await Test.createTestingModule({
        providers: [
          IndexableSourceRegistry,
          { provide: INDEXABLE_SOURCES, useValue: [sourceA, sourceB] },
        ],
      }).compile();
      registry = module.get(IndexableSourceRegistry);
    });

    it('all() returns all sources', () => {
      expect(registry.all()).toHaveLength(2);
    });

    it('resolve() resolves each source independently by entity type', () => {
      expect(registry.resolve(SearchableEntityType.DATA_MART)).toBe(sourceA);
      expect(registry.resolve('OTHER' as SearchableEntityType)).toBe(sourceB);
    });

    it('has() returns true for both registered types', () => {
      expect(registry.has(SearchableEntityType.DATA_MART)).toBe(true);
      expect(registry.has('OTHER' as SearchableEntityType)).toBe(true);
    });

    it('all() returns sources in insertion order', () => {
      const result = registry.all();
      expect(result[0]).toBe(sourceA);
      expect(result[1]).toBe(sourceB);
    });
  });

  describe('with empty sources', () => {
    let registry: IndexableSourceRegistry;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [IndexableSourceRegistry, { provide: INDEXABLE_SOURCES, useValue: [] }],
      }).compile();
      registry = module.get(IndexableSourceRegistry);
    });

    it('all() returns empty array', () => {
      expect(registry.all()).toEqual([]);
    });

    it('resolve() returns undefined', () => {
      expect(registry.resolve(SearchableEntityType.DATA_MART)).toBeUndefined();
    });

    it('has() returns false', () => {
      expect(registry.has(SearchableEntityType.DATA_MART)).toBe(false);
    });
  });

  describe('last-registration-wins for duplicate entity types', () => {
    let registry: IndexableSourceRegistry;
    let first: IndexableSource;
    let second: IndexableSource;

    beforeEach(async () => {
      first = makeSource(SearchableEntityType.DATA_MART);
      second = makeSource(SearchableEntityType.DATA_MART);
      const module = await Test.createTestingModule({
        providers: [
          IndexableSourceRegistry,
          { provide: INDEXABLE_SOURCES, useValue: [first, second] },
        ],
      }).compile();
      registry = module.get(IndexableSourceRegistry);
    });

    it('resolve() returns the second registration when entity types collide', () => {
      expect(registry.resolve(SearchableEntityType.DATA_MART)).toBe(second);
    });

    it('has() remains true', () => {
      expect(registry.has(SearchableEntityType.DATA_MART)).toBe(true);
    });
  });
});
