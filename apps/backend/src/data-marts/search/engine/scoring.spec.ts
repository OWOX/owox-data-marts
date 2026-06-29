import { scoreEntity } from './scoring';
import type { EntityScoringDescriptor } from '../indexing/entity-scoring-descriptor';
import { DATA_MART_SCORING_CONFIG } from './scoring-config';
import { SearchableEntityType } from '../../../common/search/search.facade';
import { tokenize } from './tokenizer';

function makeDescriptor(
  overrides: Partial<EntityScoringDescriptor> & { title: string }
): EntityScoringDescriptor {
  return {
    entityType: SearchableEntityType.DATA_MART,
    entityId: 'e1',
    projectId: 'project-1',
    description: null,
    richTextSlots: [{ kind: 'title', text: overrides.title }],
    atomicTokenSlots: [],
    fieldCount: 0,
    extendability: 0,
    isDraft: false,
    embeddingText: overrides.title,
    modifiedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function tokens(prompt: string): string[] {
  return Array.from(tokenize(prompt));
}

describe('scoreEntity — slot weights and priority ordering', () => {
  const cfg = DATA_MART_SCORING_CONFIG;

  it('title match earns 100 for single-token prompt', () => {
    const d = makeDescriptor({ title: 'Revenue' });
    expect(scoreEntity(d, tokens('revenue'), cfg)).toBe(100);
  });

  it('description match earns 30 for single-token prompt', () => {
    const d = makeDescriptor({
      title: 'Alpha',
      description: 'revenue quarterly report',
      richTextSlots: [
        { kind: 'title', text: 'Alpha' },
        { kind: 'description', text: 'revenue quarterly report' },
      ],
    });
    expect(scoreEntity(d, tokens('revenue'), cfg)).toBe(30);
  });

  it('context match earns 60 for single-token prompt', () => {
    const d = makeDescriptor({
      title: 'Alpha',
      richTextSlots: [
        { kind: 'title', text: 'Alpha' },
        { kind: 'context', text: 'finance' },
        { kind: 'context', text: 'revenue quarterly' },
      ],
    });
    expect(scoreEntity(d, tokens('revenue'), cfg)).toBe(60);
  });

  it('field match earns 80 for single-token prompt', () => {
    const d = makeDescriptor({
      title: 'Alpha',
      atomicTokenSlots: [{ kind: 'field', text: 'revenue_amount' }],
    });
    expect(scoreEntity(d, tokens('revenue'), cfg)).toBe(80);
  });

  it('uses strongest matching slot: title wins over context', () => {
    const d = makeDescriptor({
      title: 'Revenue Report',
      richTextSlots: [
        { kind: 'title', text: 'Revenue Report' },
        { kind: 'context', text: 'ctx' },
        { kind: 'context', text: 'revenue data' },
      ],
    });
    expect(scoreEntity(d, tokens('revenue'), cfg)).toBe(100);
  });

  it('uses strongest matching slot: field wins over context', () => {
    const d = makeDescriptor({
      title: 'Alpha',
      richTextSlots: [
        { kind: 'title', text: 'Alpha' },
        { kind: 'context', text: 'finance' },
        { kind: 'context', text: 'revenue quarterly' },
      ],
      atomicTokenSlots: [{ kind: 'field', text: 'revenue' }],
    });
    expect(scoreEntity(d, tokens('revenue'), cfg)).toBe(80);
  });

  it('uses strongest matching slot: field wins over description', () => {
    const d = makeDescriptor({
      title: 'Alpha',
      description: 'contains revenue data',
      richTextSlots: [
        { kind: 'title', text: 'Alpha' },
        { kind: 'description', text: 'contains revenue data' },
      ],
      atomicTokenSlots: [{ kind: 'field', text: 'revenue' }],
    });
    expect(scoreEntity(d, tokens('revenue'), cfg)).toBe(80);
  });

  it('sums credits across multiple tokens with partial matches', () => {
    const d = makeDescriptor({
      title: 'Revenue',
      description: 'contains orders history',
      richTextSlots: [
        { kind: 'title', text: 'Revenue' },
        { kind: 'description', text: 'contains orders history' },
      ],
    });
    const promptTokens = tokens('revenue orders');
    const expected = Math.min(100, Math.round(((1.0 + 0.3) / 2) * 100));
    expect(scoreEntity(d, promptTokens, cfg)).toBe(expected);
  });

  it('returns 0 for empty promptTokens', () => {
    const d = makeDescriptor({ title: 'Revenue' });
    expect(scoreEntity(d, [], cfg)).toBe(0);
  });

  it('caps at maxKeywordScore (100)', () => {
    const d = makeDescriptor({ title: 'revenue orders report alpha' });
    const result = scoreEntity(d, tokens('revenue orders report'), cfg);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('uses config weights and not hardcoded values', () => {
    const customCfg = {
      ...cfg,
      keywordSlotWeights: { title: 0.5, context: 0.5, field: 0.5, description: 0.5 },
      maxKeywordScore: 100,
    };
    const d = makeDescriptor({ title: 'Revenue' });
    expect(scoreEntity(d, tokens('revenue'), customCfg)).toBe(50);
  });

  it('uses maxKeywordScore from config to cap the result', () => {
    const customCfg = { ...cfg, maxKeywordScore: 50 };
    const d = makeDescriptor({ title: 'revenue orders report' });
    const result = scoreEntity(d, tokens('revenue orders report'), customCfg);
    expect(result).toBeLessThanOrEqual(50);
  });

  it('exact scores match the scoreDataMart private implementation for parity', () => {
    const titleScore = scoreEntity(makeDescriptor({ title: 'Revenue' }), tokens('revenue'), cfg);
    const ctxScore = scoreEntity(
      makeDescriptor({
        title: 'Alpha',
        richTextSlots: [
          { kind: 'title', text: 'Alpha' },
          { kind: 'context', text: 'revenue' },
          { kind: 'context', text: '' },
        ],
      }),
      tokens('revenue'),
      cfg
    );
    const fieldScore = scoreEntity(
      makeDescriptor({
        title: 'Alpha',
        atomicTokenSlots: [{ kind: 'field', text: 'revenue' }],
      }),
      tokens('revenue'),
      cfg
    );
    const descScore = scoreEntity(
      makeDescriptor({
        title: 'Alpha',
        description: 'revenue',
        richTextSlots: [
          { kind: 'title', text: 'Alpha' },
          { kind: 'description', text: 'revenue' },
        ],
      }),
      tokens('revenue'),
      cfg
    );

    expect(titleScore).toBe(100);
    expect(ctxScore).toBe(60);
    expect(fieldScore).toBe(80);
    expect(descScore).toBe(30);
  });
});
