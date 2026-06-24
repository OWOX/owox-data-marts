import { Test, TestingModule } from '@nestjs/testing';
import { InMemoryPaginatedSearch } from './in-memory-paginated.search';
import { IndexableSourceRegistry } from '../sources/indexable-source.registry';
import {
  SearchIndexRepository,
  StreamPage,
  StreamedIndexRow,
} from '../schema/search-index.repository';
import { SearchableEntityType } from '../../../common/search/search.facade';
import { DATA_MART_SCORING_CONFIG } from './scoring-config';
import { vecToBuffer } from '../embedding/vector-codec';
import { buildDocument } from '../indexing/document-builder';
import type { EntityScoringDescriptor } from '../indexing/entity-scoring-descriptor';
import type {
  AccessPredicate,
  IndexableSource,
  SourceAccessScope,
} from '../sources/indexable-source.port';
import type { VectorSearchOptions } from './vector-search.port';

function makeDescriptor(overrides: Partial<EntityScoringDescriptor> = {}): EntityScoringDescriptor {
  return {
    entityType: SearchableEntityType.DATA_MART,
    entityId: 'dm-1',
    projectId: 'proj-1',
    title: 'Revenue',
    description: null,
    richTextSlots: [{ kind: 'title', text: 'Revenue' }],
    atomicTokenSlots: [],
    fieldCount: 0,
    extendability: 0,
    isDraft: false,
    embeddingText: 'Revenue',
    modifiedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function unitVec(values: number[]): Float32Array {
  const arr = new Float32Array(values);
  const norm = Math.sqrt(arr.reduce((s, x) => s + x * x, 0));
  return arr.map(x => x / norm) as unknown as Float32Array;
}

const DEFAULT_PROMPT_VEC = unitVec([1, 0, 0]);

function makeIndexRow(
  descriptor: EntityScoringDescriptor,
  embedding: Float32Array | null | undefined = DEFAULT_PROMPT_VEC
): StreamedIndexRow {
  return {
    entityId: descriptor.entityId,
    projectId: descriptor.projectId,
    isDraft: descriptor.isDraft,
    embedding: embedding ? vecToBuffer(embedding) : null,
    document: buildDocument(descriptor),
    fieldCount: descriptor.fieldCount,
    docHash: 'hash',
    updatedAt: new Date('2024-01-01'),
  };
}

const NO_PREDICATE: AccessPredicate = { joinSql: '', whereSql: '', parameters: {} };

const DEFAULT_OPTIONS: VectorSearchOptions = {
  topK: 10,
  minRelevance: 0,
  candidateLimit: 100,
};

function makeSinglePage(rows: StreamedIndexRow[]): StreamPage {
  return { rows, nextCursor: null };
}

describe('InMemoryPaginatedSearch', () => {
  let search: InMemoryPaginatedSearch;
  let registry: jest.Mocked<Pick<IndexableSourceRegistry, 'resolve'>>;
  let repository: jest.Mocked<Pick<SearchIndexRepository, 'searchCandidates'>>;
  let mockSource: jest.Mocked<Pick<IndexableSource, 'scoringConfig' | 'accessPredicateProvider'>>;

  beforeEach(async () => {
    mockSource = {
      scoringConfig: DATA_MART_SCORING_CONFIG,
      accessPredicateProvider: {
        build: jest.fn().mockResolvedValue(NO_PREDICATE),
      },
    };

    registry = {
      resolve: jest.fn().mockReturnValue(mockSource),
    };

    repository = {
      searchCandidates: jest.fn().mockResolvedValue(makeSinglePage([])),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InMemoryPaginatedSearch,
        { provide: IndexableSourceRegistry, useValue: registry },
        { provide: SearchIndexRepository, useValue: repository },
      ],
    }).compile();

    search = module.get(InMemoryPaginatedSearch);
  });

  describe('source resolution', () => {
    it('returns empty when entity type is not registered', async () => {
      registry.resolve.mockReturnValue(undefined);

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        DEFAULT_OPTIONS
      );

      expect(results).toEqual([]);
      expect(repository.searchCandidates).not.toHaveBeenCalled();
    });

    it('logs database-backed vector search mode before querying candidates', async () => {
      const logSpy = jest.spyOn(search['logger'], 'log').mockImplementation(() => undefined);

      await search.search(SearchableEntityType.DATA_MART, 'proj-1', 'revenue', unitVec([1, 0]), {
        ...DEFAULT_OPTIONS,
        excludeDrafts: true,
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('advanced-search vector search mode')
      );
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('mode=database-candidate-query'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('scoring=application-vector'));
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(`entityType=${SearchableEntityType.DATA_MART}`)
      );
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('promptVecAvailable=true'));
      expect(logSpy).not.toHaveBeenCalledWith('[object Object]');

      logSpy.mockRestore();
    });

    it('builds the access predicate with the index alias and access scope', async () => {
      const accessScope: SourceAccessScope = { userId: 'u-1', roles: ['viewer'] };
      const opts = { ...DEFAULT_OPTIONS, accessScope };

      await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        opts
      );

      expect(mockSource.accessPredicateProvider.build).toHaveBeenCalledWith(
        'idx',
        'proj-1',
        accessScope
      );
    });
  });

  describe('candidate selection', () => {
    it('uses repository.searchCandidates to retrieve candidates', async () => {
      repository.searchCandidates.mockResolvedValue(
        makeSinglePage([makeIndexRow(makeDescriptor({ entityId: 'dm-1' }))])
      );

      await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        DEFAULT_OPTIONS
      );

      expect(repository.searchCandidates).toHaveBeenCalledTimes(1);
    });

    it('passes projectId, predicate, prompt, and candidateLimit to searchCandidates', async () => {
      const predicate = {
        joinSql: 'JOIN dm ON dm.id = idx.entity_id',
        whereSql: "dm.status = 'PUBLISHED'",
        parameters: {},
      };
      (mockSource.accessPredicateProvider.build as jest.Mock).mockResolvedValue(predicate);

      await search.search(SearchableEntityType.DATA_MART, 'proj-1', 'revenue', DEFAULT_PROMPT_VEC, {
        ...DEFAULT_OPTIONS,
        candidateLimit: 25,
        vectorCandidateLimit: 50,
      });

      expect(repository.searchCandidates).toHaveBeenCalledWith(
        SearchableEntityType.DATA_MART,
        'proj-1',
        predicate,
        'revenue',
        expect.objectContaining({
          candidateLimit: 25,
          vectorCandidateLimit: 50,
          excludeDrafts: undefined,
          promptVec: DEFAULT_PROMPT_VEC,
        })
      );
    });

    it('passes promptVec to repository.searchCandidates for database-native vector search', async () => {
      const promptVec = unitVec([1, 0]);

      await search.search(SearchableEntityType.DATA_MART, 'proj-1', 'revenue', promptVec, {
        ...DEFAULT_OPTIONS,
        candidateLimit: 25,
      });

      expect(repository.searchCandidates).toHaveBeenCalledWith(
        SearchableEntityType.DATA_MART,
        'proj-1',
        NO_PREDICATE,
        'revenue',
        expect.objectContaining({ promptVec })
      );
    });

    it('returns empty array when all pages are empty', async () => {
      repository.searchCandidates.mockResolvedValue(makeSinglePage([]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        DEFAULT_OPTIONS
      );

      expect(results).toEqual([]);
    });

    it('returns empty without querying candidates when prompt embedding is unavailable', async () => {
      const warnSpy = jest.spyOn(search['logger'], 'warn').mockImplementation(() => undefined);

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        null,
        DEFAULT_OPTIONS
      );

      expect(results).toEqual([]);
      expect(repository.searchCandidates).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('prompt embedding unavailable'));

      warnSpy.mockRestore();
    });
  });

  describe('keyword scoring component', () => {
    it('scores title match at 100 for a single-token prompt', async () => {
      const descriptor = makeDescriptor({
        entityId: 'dm-1',
        title: 'Revenue',
        richTextSlots: [{ kind: 'title', text: 'Revenue' }],
      });
      repository.searchCandidates.mockResolvedValue(makeSinglePage([makeIndexRow(descriptor)]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        DEFAULT_OPTIONS
      );

      expect(results[0].kwScore).toBe(100);
      expect(results[0].vecScore).toBe(100);
      expect(results[0].finalScore).toBe(100 + results[0].extendability);
    });

    it('scores context match at 60 for a single-token prompt (context before field in else-if chain)', async () => {
      const descriptor = makeDescriptor({
        entityId: 'dm-1',
        title: 'Alpha',
        richTextSlots: [
          { kind: 'title', text: 'Alpha' },
          { kind: 'context', text: 'finance' },
          { kind: 'context', text: 'revenue data' },
        ],
        atomicTokenSlots: [{ kind: 'field', text: 'revenue' }],
      });
      repository.searchCandidates.mockResolvedValue(makeSinglePage([makeIndexRow(descriptor)]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        DEFAULT_OPTIONS
      );

      expect(results[0].kwScore).toBe(60);
    });

    it('scores field match at 80 when only field contains the token', async () => {
      const descriptor = makeDescriptor({
        entityId: 'dm-1',
        title: 'Alpha',
        richTextSlots: [{ kind: 'title', text: 'Alpha' }],
        atomicTokenSlots: [{ kind: 'field', text: 'revenue_amount' }],
      });
      repository.searchCandidates.mockResolvedValue(makeSinglePage([makeIndexRow(descriptor)]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        DEFAULT_OPTIONS
      );

      expect(results[0].kwScore).toBe(80);
    });

    it('scores description match at 30 when only description contains the token', async () => {
      const descriptor = makeDescriptor({
        entityId: 'dm-1',
        title: 'Alpha',
        description: 'contains revenue data',
        richTextSlots: [
          { kind: 'title', text: 'Alpha' },
          { kind: 'description', text: 'contains revenue data' },
        ],
      });
      repository.searchCandidates.mockResolvedValue(makeSinglePage([makeIndexRow(descriptor)]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        DEFAULT_OPTIONS
      );

      expect(results[0].kwScore).toBe(30);
    });

    it('kwScore is 0 when prompt is empty', async () => {
      const descriptor = makeDescriptor({ entityId: 'dm-1', title: 'Revenue' });
      repository.searchCandidates.mockResolvedValue(makeSinglePage([makeIndexRow(descriptor)]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        '',
        DEFAULT_PROMPT_VEC,
        {
          ...DEFAULT_OPTIONS,
          minRelevance: 0,
        }
      );

      expect(results[0].kwScore).toBe(0);
    });
  });

  describe('vector blending', () => {
    it('blends vecScore and kwScore with 0.65/0.35 weights when both vectors present', async () => {
      const descriptor = makeDescriptor({ entityId: 'dm-1', title: 'Revenue' });
      const vec = unitVec([1, 0, 0]);
      const row = makeIndexRow(descriptor, vec);
      repository.searchCandidates.mockResolvedValue(makeSinglePage([row]));

      const promptVec = unitVec([1, 0, 0]);
      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        promptVec,
        DEFAULT_OPTIONS
      );

      const r = results[0];
      expect(r.vecScore).toBe(100);
      expect(r.kwScore).toBe(100);
      const expectedBlend = Math.round(100 * 0.65 + 100 * 0.35);
      expect(r.relevance).toBe(expectedBlend);
    });

    it('skips rows whose embedding buffer is null', async () => {
      const descriptor = makeDescriptor({ entityId: 'dm-1', title: 'Revenue' });
      const row = makeIndexRow(descriptor, null);
      repository.searchCandidates.mockResolvedValue(makeSinglePage([row]));

      const promptVec = unitVec([1, 0, 0]);
      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        promptVec,
        DEFAULT_OPTIONS
      );

      expect(results).toEqual([]);
    });

    it('returns empty when promptVec is null even if rows have embeddings', async () => {
      const descriptor = makeDescriptor({ entityId: 'dm-1', title: 'Revenue' });
      const row = makeIndexRow(descriptor, unitVec([1, 0, 0]));
      repository.searchCandidates.mockResolvedValue(makeSinglePage([row]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        null,
        DEFAULT_OPTIONS
      );

      expect(results).toEqual([]);
    });

    it('low cosine similarity produces lower vecScore than perfect match', async () => {
      const d1 = makeDescriptor({ entityId: 'dm-1', title: 'Revenue' });
      const d2 = makeDescriptor({
        entityId: 'dm-2',
        richTextSlots: [{ kind: 'title', text: 'Revenue' }],
      });
      const perfectVec = unitVec([1, 0, 0]);
      const weakVec = unitVec([0, 1, 0]);

      repository.searchCandidates.mockResolvedValue(
        makeSinglePage([makeIndexRow(d1, perfectVec), makeIndexRow(d2, weakVec)])
      );

      const promptVec = unitVec([1, 0, 0]);
      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        promptVec,
        DEFAULT_OPTIONS
      );

      const perfect = results.find(r => r.entityId === 'dm-1')!;
      const weak = results.find(r => r.entityId === 'dm-2')!;
      expect(perfect.vecScore).toBeGreaterThan(weak.vecScore!);
    });
  });

  describe('extendability', () => {
    it('extendability = 0 when field_count is 0', async () => {
      const descriptor = makeDescriptor({ entityId: 'dm-1', fieldCount: 0 });
      repository.searchCandidates.mockResolvedValue(makeSinglePage([makeIndexRow(descriptor)]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        { ...DEFAULT_OPTIONS, minRelevance: 0 }
      );

      expect(results[0].extendability).toBe(0);
    });

    it('extendability = round(log2(fieldCount+1)*10)', async () => {
      const fieldCount = 3;
      const descriptor = makeDescriptor({ entityId: 'dm-1', fieldCount });
      const row = { ...makeIndexRow(descriptor), fieldCount };
      repository.searchCandidates.mockResolvedValue(makeSinglePage([row]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        DEFAULT_OPTIONS
      );

      const expected = Math.round(Math.log2(fieldCount + 1) * 10);
      expect(results[0].extendability).toBe(expected);
    });

    it('finalScore = relevance + extendability', async () => {
      const fieldCount = 7;
      const descriptor = makeDescriptor({ entityId: 'dm-1', fieldCount });
      const row = { ...makeIndexRow(descriptor), fieldCount };
      repository.searchCandidates.mockResolvedValue(makeSinglePage([row]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        DEFAULT_OPTIONS
      );

      const r = results[0];
      expect(r.finalScore).toBe(r.relevance + r.extendability);
    });
  });

  describe('minRelevance cutoff', () => {
    it('excludes rows where relevance < minRelevance', async () => {
      const highTitle = makeDescriptor({
        entityId: 'dm-high',
        title: 'Revenue Report',
        richTextSlots: [{ kind: 'title', text: 'Revenue Report' }],
      });
      const descOnly = makeDescriptor({
        entityId: 'dm-low',
        title: 'Alpha',
        description: 'revenue data',
        richTextSlots: [
          { kind: 'title', text: 'Alpha' },
          { kind: 'description', text: 'revenue data' },
        ],
      });

      repository.searchCandidates.mockResolvedValue(
        makeSinglePage([makeIndexRow(highTitle), makeIndexRow(descOnly, unitVec([0, 1, 0]))])
      );

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        { ...DEFAULT_OPTIONS, minRelevance: 40 }
      );

      expect(results.some(r => r.entityId === 'dm-high')).toBe(true);
      expect(results.some(r => r.entityId === 'dm-low')).toBe(false);
    });

    it('keeps rows where relevance exactly equals minRelevance', async () => {
      const descriptor = makeDescriptor({
        entityId: 'dm-1',
        title: 'Revenue',
        richTextSlots: [{ kind: 'title', text: 'Revenue' }],
      });
      repository.searchCandidates.mockResolvedValue(
        makeSinglePage([makeIndexRow(descriptor, unitVec([0, 1, 0]))])
      );

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        { ...DEFAULT_OPTIONS, minRelevance: 35 }
      );

      expect(results).toHaveLength(1);
      expect(results[0].kwScore).toBe(100);
      expect(results[0].relevance).toBe(35);
    });

    it('cutoff uses relevance (keywordsSimilarity), NOT finalScore', async () => {
      const highFieldCount = makeDescriptor({
        entityId: 'dm-1',
        title: 'Alpha',
        description: 'revenue data',
        richTextSlots: [
          { kind: 'title', text: 'Alpha' },
          { kind: 'description', text: 'revenue data' },
        ],
        fieldCount: 100,
      });
      const row = { ...makeIndexRow(highFieldCount, unitVec([0, 1, 0])), fieldCount: 100 };
      repository.searchCandidates.mockResolvedValue(makeSinglePage([row]));

      const results12 = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        { ...DEFAULT_OPTIONS, minRelevance: 12 }
      );

      expect(results12).toHaveLength(0);

      const results11 = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        { ...DEFAULT_OPTIONS, minRelevance: 11 }
      );
      expect(results11).toHaveLength(1);
      expect(results11[0].relevance).toBe(11);
      expect(results11[0].finalScore).toBeGreaterThan(11);
    });

    it('returns all rows when minRelevance is 0', async () => {
      const noMatch = makeDescriptor({
        entityId: 'dm-1',
        title: 'Zeta',
        richTextSlots: [{ kind: 'title', text: 'Zeta' }],
      });
      repository.searchCandidates.mockResolvedValue(makeSinglePage([makeIndexRow(noMatch)]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        { ...DEFAULT_OPTIONS, minRelevance: 0 }
      );

      expect(results).toHaveLength(1);
    });
  });

  describe('top-K min-heap', () => {
    function makeDescriptors(n: number): EntityScoringDescriptor[] {
      return Array.from({ length: n }, (_, i) =>
        makeDescriptor({
          entityId: `dm-${i}`,
          title: 'Revenue',
          richTextSlots: [{ kind: 'title', text: 'Revenue' }],
        })
      );
    }

    it('returns at most topK results', async () => {
      const descriptors = makeDescriptors(10);
      repository.searchCandidates.mockResolvedValue(
        makeSinglePage(descriptors.map(d => makeIndexRow(d)))
      );

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        { ...DEFAULT_OPTIONS, topK: 3 }
      );

      expect(results).toHaveLength(3);
    });

    it('keeps the topK highest-finalScore rows', async () => {
      const high = makeDescriptor({
        entityId: 'dm-high',
        title: 'Revenue Orders Quarterly',
        richTextSlots: [{ kind: 'title', text: 'Revenue Orders Quarterly' }],
      });
      const mid = makeDescriptor({
        entityId: 'dm-mid',
        title: 'Revenue Orders',
        richTextSlots: [{ kind: 'title', text: 'Revenue Orders' }],
      });
      const low = makeDescriptor({
        entityId: 'dm-low',
        title: 'Revenue',
        richTextSlots: [{ kind: 'title', text: 'Revenue' }],
      });
      const veryLow = makeDescriptor({
        entityId: 'dm-vlow',
        title: 'Alpha',
        description: 'revenue related',
        richTextSlots: [
          { kind: 'title', text: 'Alpha' },
          { kind: 'description', text: 'revenue related' },
        ],
      });

      repository.searchCandidates.mockResolvedValue(
        makeSinglePage([
          makeIndexRow(high),
          makeIndexRow(mid),
          makeIndexRow(low),
          makeIndexRow(veryLow),
        ])
      );

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue orders',
        DEFAULT_PROMPT_VEC,
        { ...DEFAULT_OPTIONS, topK: 2 }
      );

      expect(results).toHaveLength(2);
      const ids = results.map(r => r.entityId);
      expect(ids).toContain('dm-high');
      expect(ids).toContain('dm-mid');
    });

    it('min-heap evicts by finalScore (including extendability), not relevance alone', async () => {
      const highExt = makeDescriptor({
        entityId: 'dm-ext',
        title: 'Alpha',
        description: 'revenue info',
        richTextSlots: [
          { kind: 'title', text: 'Alpha' },
          { kind: 'description', text: 'revenue info' },
        ],
        fieldCount: 255,
      });
      const highKw = makeDescriptor({
        entityId: 'dm-kw',
        title: 'Revenue',
        richTextSlots: [{ kind: 'title', text: 'Revenue' }],
        fieldCount: 0,
      });

      const rowExt = { ...makeIndexRow(highExt), fieldCount: 255 };
      const rowKw = { ...makeIndexRow(highKw), fieldCount: 0 };

      repository.searchCandidates.mockResolvedValue(makeSinglePage([rowExt, rowKw]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        { ...DEFAULT_OPTIONS, topK: 2, minRelevance: 0 }
      );

      expect(results).toHaveLength(2);
      expect(results[0].finalScore).toBeGreaterThanOrEqual(results[1].finalScore);
    });

    it('returns fewer than topK when fewer rows pass minRelevance', async () => {
      const d1 = makeDescriptor({
        entityId: 'dm-1',
        title: 'Revenue',
        richTextSlots: [{ kind: 'title', text: 'Revenue' }],
      });
      const d2 = makeDescriptor({
        entityId: 'dm-2',
        title: 'Unrelated',
        richTextSlots: [{ kind: 'title', text: 'Unrelated' }],
      });

      repository.searchCandidates.mockResolvedValue(
        makeSinglePage([makeIndexRow(d1), makeIndexRow(d2, unitVec([0, 1, 0]))])
      );

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        { ...DEFAULT_OPTIONS, topK: 5, minRelevance: 50 }
      );

      expect(results.length).toBeLessThan(5);
      expect(results.every(r => r.entityId === 'dm-1')).toBe(true);
    });
  });

  describe('result ordering', () => {
    it('returns results sorted descending by finalScore', async () => {
      const highField = makeDescriptor({
        entityId: 'dm-high',
        title: 'Revenue',
        richTextSlots: [{ kind: 'title', text: 'Revenue' }],
        fieldCount: 15,
      });
      const lowField = makeDescriptor({
        entityId: 'dm-low',
        title: 'Revenue',
        richTextSlots: [{ kind: 'title', text: 'Revenue' }],
        fieldCount: 0,
      });

      const rowHigh = { ...makeIndexRow(highField), fieldCount: 15 };
      const rowLow = { ...makeIndexRow(lowField), fieldCount: 0 };

      repository.searchCandidates.mockResolvedValue(makeSinglePage([rowLow, rowHigh]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        DEFAULT_OPTIONS
      );

      expect(results[0].entityId).toBe('dm-high');
      expect(results[1].entityId).toBe('dm-low');
    });

    it('result with higher finalScore appears first even when kwScore is the same', async () => {
      const d1 = makeDescriptor({
        entityId: 'dm-1',
        title: 'Revenue',
        richTextSlots: [{ kind: 'title', text: 'Revenue' }],
        fieldCount: 0,
      });
      const d2 = makeDescriptor({
        entityId: 'dm-2',
        richTextSlots: [{ kind: 'title', text: 'Revenue' }],
        fieldCount: 7,
      });

      const row1 = { ...makeIndexRow(d1), fieldCount: 0 };
      const row2 = { ...makeIndexRow(d2), fieldCount: 7 };

      repository.searchCandidates.mockResolvedValue(makeSinglePage([row1, row2]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        DEFAULT_OPTIONS
      );

      const r1 = results.find(r => r.entityId === 'dm-1')!;
      const r2 = results.find(r => r.entityId === 'dm-2')!;
      expect(r2.finalScore).toBeGreaterThan(r1.finalScore);
      expect(results[0].entityId).toBe('dm-2');
    });
  });

  describe('tie-break determinism', () => {
    it('when more rows than topK have equal finalScore, survivors match stream-arrival order', async () => {
      const descriptors = ['dm-a', 'dm-b', 'dm-c', 'dm-d', 'dm-e'].map(id =>
        makeDescriptor({
          entityId: id,
          title: 'Revenue',
          richTextSlots: [{ kind: 'title', text: 'Revenue' }],
          fieldCount: 0,
        })
      );
      repository.searchCandidates.mockResolvedValue(
        makeSinglePage(descriptors.map(d => makeIndexRow(d)))
      );

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        { ...DEFAULT_OPTIONS, topK: 3, minRelevance: 0 }
      );

      expect(results).toHaveLength(3);
      const ids = results.map(r => r.entityId);
      expect(ids).toContain('dm-a');
      expect(ids).toContain('dm-b');
      expect(ids).toContain('dm-c');
      expect(ids).not.toContain('dm-d');
      expect(ids).not.toContain('dm-e');
    });

    it('equal finalScore survivors appear sorted by stream-arrival order (ascending insertionIndex)', async () => {
      const descriptors = ['dm-a', 'dm-b', 'dm-c'].map(id =>
        makeDescriptor({
          entityId: id,
          title: 'Revenue',
          richTextSlots: [{ kind: 'title', text: 'Revenue' }],
          fieldCount: 0,
        })
      );
      repository.searchCandidates.mockResolvedValue(
        makeSinglePage(descriptors.map(d => makeIndexRow(d)))
      );

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        { ...DEFAULT_OPTIONS, topK: 3, minRelevance: 0 }
      );

      expect(results.map(r => r.entityId)).toEqual(['dm-a', 'dm-b', 'dm-c']);
    });
  });

  describe('row skipping', () => {
    it('skips rows with null document', async () => {
      const row: StreamedIndexRow = {
        entityId: 'dm-null',
        projectId: 'proj-1',
        isDraft: false,
        embedding: null,
        document: null,
        fieldCount: 0,
        docHash: 'h',
        updatedAt: new Date(),
      };
      repository.searchCandidates.mockResolvedValue(makeSinglePage([row]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        { ...DEFAULT_OPTIONS, minRelevance: 0 }
      );

      expect(results).toHaveLength(0);
    });

    it('skips rows with malformed document JSON', async () => {
      const row: StreamedIndexRow = {
        entityId: 'dm-bad',
        projectId: 'proj-1',
        isDraft: false,
        embedding: null,
        document: 'not valid json {{{',
        fieldCount: 0,
        docHash: 'h',
        updatedAt: new Date(),
      };
      repository.searchCandidates.mockResolvedValue(makeSinglePage([row]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        { ...DEFAULT_OPTIONS, minRelevance: 0 }
      );

      expect(results).toHaveLength(0);
    });
  });

  describe('ScoredEntity shape', () => {
    it('returns all required ScoredEntity fields', async () => {
      const descriptor = makeDescriptor({
        entityId: 'dm-1',
        title: 'Revenue',
        description: 'Monthly revenue',
        richTextSlots: [
          { kind: 'title', text: 'Revenue' },
          { kind: 'description', text: 'Monthly revenue' },
        ],
        fieldCount: 4,
      });
      const row = { ...makeIndexRow(descriptor), fieldCount: 4 };
      repository.searchCandidates.mockResolvedValue(makeSinglePage([row]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        DEFAULT_OPTIONS
      );

      const r = results[0];
      expect(r.entityType).toBe(SearchableEntityType.DATA_MART);
      expect(r.entityId).toBe('dm-1');
      expect(r.title).toBe('Revenue');
      expect(r.description).toBe('Monthly revenue');
      expect(typeof r.finalScore).toBe('number');
      expect(typeof r.kwScore).toBe('number');
      expect(r.vecScore).toBe(100);
      expect(typeof r.extendability).toBe('number');
      expect(r.relevance).toBe(r.finalScore - r.extendability);
    });

    it('relevance equals finalScore minus extendability', async () => {
      const descriptor = makeDescriptor({ entityId: 'dm-1', title: 'Revenue', fieldCount: 5 });
      const row = { ...makeIndexRow(descriptor), fieldCount: 5 };
      repository.searchCandidates.mockResolvedValue(makeSinglePage([row]));

      const results = await search.search(
        SearchableEntityType.DATA_MART,
        'proj-1',
        'revenue',
        DEFAULT_PROMPT_VEC,
        DEFAULT_OPTIONS
      );

      const r = results[0];
      expect(r.relevance).toBe(r.finalScore - r.extendability);
    });
  });
});
