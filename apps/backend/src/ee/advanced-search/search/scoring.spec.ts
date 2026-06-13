import { rank } from './scoring';
import type { IndexedVector } from './scoring';
import type { SearchableDataMart, RelationshipEdge } from '../catalog/data-mart-catalog.port';

function makeMart(
  overrides: Partial<SearchableDataMart> & { id: string; title: string }
): SearchableDataMart {
  return {
    projectId: 'project-1',
    description: null,
    fieldNames: [],
    contexts: [],
    modifiedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function unitVec(dim: number, value = 1.0): Float32Array {
  const v = new Float32Array(dim).fill(0);
  v[0] = value;
  return v;
}

describe('rank — credit weights', () => {
  const mart = makeMart({
    id: 'm1',
    title: 'Revenue',
    description: null,
    fieldNames: [],
    contexts: [],
  });

  it('title match earns 100 for single-token prompt', () => {
    const result = rank([mart], [], [], 'revenue', null);
    expect(result[0]!.kwScore).toBe(100);
  });

  it('description-only match earns 30 for single-token prompt', () => {
    const m = makeMart({ id: 'm1', title: 'Alpha', description: 'revenue quarterly report' });
    const result = rank([m], [], [], 'revenue', null);
    expect(result[0]!.kwScore).toBe(30);
  });

  it('context match earns 60 for single-token prompt', () => {
    const m = makeMart({
      id: 'm1',
      title: 'Alpha',
      contexts: [{ name: 'finance', content: 'revenue quarterly' }],
    });
    const result = rank([m], [], [], 'revenue', null);
    expect(result[0]!.kwScore).toBe(60);
  });

  it('fieldNames match earns 80 for single-token prompt', () => {
    const m = makeMart({ id: 'm1', title: 'Alpha', fieldNames: ['revenue_amount'] });
    const result = rank([m], [], [], 'revenue', null);
    expect(result[0]!.kwScore).toBe(80);
  });

  it('first-match-wins: title wins over context', () => {
    const m = makeMart({
      id: 'm1',
      title: 'Revenue Report',
      contexts: [{ name: 'ctx', content: 'revenue data' }],
    });
    const result = rank([m], [], [], 'revenue', null);
    expect(result[0]!.kwScore).toBe(100);
  });

  it('first-match-wins: context wins over fieldNames', () => {
    const m = makeMart({
      id: 'm1',
      title: 'Alpha',
      contexts: [{ name: 'finance', content: 'revenue quarterly' }],
      fieldNames: ['revenue'],
    });
    const result = rank([m], [], [], 'revenue', null);
    expect(result[0]!.kwScore).toBe(60);
  });

  it('first-match-wins: fieldNames wins over description', () => {
    const m = makeMart({
      id: 'm1',
      title: 'Alpha',
      description: 'contains revenue data',
      fieldNames: ['revenue'],
    });
    const result = rank([m], [], [], 'revenue', null);
    expect(result[0]!.kwScore).toBe(80);
  });

  it('sums credits across multiple tokens', () => {
    const m = makeMart({
      id: 'm1',
      title: 'Revenue',
      description: 'contains orders history',
    });
    const result = rank([m], [], [], 'revenue orders', null);
    expect(result[0]!.kwScore).toBe(Math.min(100, Math.round(((1.0 + 0.3) / 2) * 100)));
  });

  it('capped at 100', () => {
    const m = makeMart({ id: 'm1', title: 'revenue orders report alpha' });
    const result = rank([m], [], [], 'revenue orders report', null);
    expect(result[0]!.kwScore).toBeLessThanOrEqual(100);
  });
});

describe('rank — hybrid 0.65/0.35 rounding', () => {
  it('combines vecScore and kwScore with 0.65/0.35 weights', () => {
    const mart = makeMart({ id: 'm1', title: 'Revenue' });
    const promptVec = new Float32Array([1.0, 0.0]);
    const martVec = new Float32Array([1.0, 0.0]);
    const index: IndexedVector[] = [{ dataMartId: 'm1', vector: martVec }];

    const result = rank([mart], [], index, 'revenue', promptVec);
    const item = result[0]!;

    expect(item.vecScore).toBe(100);
    expect(item.kwScore).toBe(100);
    expect(item.finalScore - item.extendability).toBe(Math.round(100 * 0.65 + 100 * 0.35));
  });

  it('uses kwScore-only when promptVec is null', () => {
    const mart = makeMart({ id: 'm1', title: 'Revenue' });
    const index: IndexedVector[] = [{ dataMartId: 'm1', vector: new Float32Array([1.0, 0.0]) }];

    const result = rank([mart], [], index, 'revenue', null);
    const item = result[0]!;

    expect(item.vecScore).toBeNull();
    expect(item.finalScore - item.extendability).toBe(item.kwScore);
  });

  it('vecScore is null when mart has no vector in index', () => {
    const mart = makeMart({ id: 'm1', title: 'Revenue' });
    const promptVec = new Float32Array([1.0, 0.0]);

    const result = rank([mart], [], [], 'revenue', promptVec);
    const item = result[0]!;

    expect(item.vecScore).toBeNull();
    expect(item.finalScore - item.extendability).toBe(item.kwScore);
  });

  it('vecScore is null when mart vector is null in index', () => {
    const mart = makeMart({ id: 'm1', title: 'Revenue' });
    const promptVec = new Float32Array([1.0, 0.0]);
    const index: IndexedVector[] = [{ dataMartId: 'm1', vector: null }];

    const result = rank([mart], [], index, 'revenue', promptVec);
    const item = result[0]!;

    expect(item.vecScore).toBeNull();
  });
});

describe('rank — extendability log2 formula', () => {
  it('extendability = 0 when no fields', () => {
    const mart = makeMart({ id: 'm1', title: 'Empty', fieldNames: [] });
    const result = rank([mart], [], [], 'empty', null);
    expect(result[0]!.extendability).toBe(0);
  });

  it('extendability = round(log2(n+1)*10)', () => {
    const mart = makeMart({ id: 'm1', title: 'Alpha', fieldNames: ['f1', 'f2', 'f3'] });
    const expected = Math.round(Math.log2(3 + 1) * 10);
    const result = rank([mart], [], [], 'alpha', null);
    expect(result[0]!.extendability).toBe(expected);
  });

  it('includes fieldNames of relationship target in outbound count', () => {
    const source = makeMart({ id: 'src', title: 'Source', fieldNames: ['s1', 's2'] });
    const target = makeMart({ id: 'tgt', title: 'Target', fieldNames: ['t1', 't2', 't3'] });
    const edges: RelationshipEdge[] = [{ sourceDataMartId: 'src', targetDataMartId: 'tgt' }];

    const result = rank([source, target], edges, [], 'source', null);
    const srcItem = result.find(r => r.dataMartId === 'src')!;

    const totalFields = 2 + 3;
    const expectedExtendability = Math.round(Math.log2(totalFields + 1) * 10);
    expect(srcItem.extendability).toBe(expectedExtendability);
  });

  it('does not count target fields for the target itself (only outbound)', () => {
    const source = makeMart({ id: 'src', title: 'Source', fieldNames: ['s1'] });
    const target = makeMart({ id: 'tgt', title: 'Target', fieldNames: ['t1', 't2'] });
    const edges: RelationshipEdge[] = [{ sourceDataMartId: 'src', targetDataMartId: 'tgt' }];

    const result = rank([source, target], edges, [], 'target', null);
    const tgtItem = result.find(r => r.dataMartId === 'tgt')!;

    const expectedExtendability = Math.round(Math.log2(2 + 1) * 10);
    expect(tgtItem.extendability).toBe(expectedExtendability);
  });
});

describe('rank — finalScore ordering', () => {
  it('sorts by finalScore descending', () => {
    const high = makeMart({ id: 'h', title: 'Revenue Orders', fieldNames: [] });
    const low = makeMart({ id: 'l', title: 'Alpha', fieldNames: [] });

    const result = rank([low, high], [], [], 'revenue orders', null);
    expect(result[0]!.dataMartId).toBe('h');
    expect(result[1]!.dataMartId).toBe('l');
  });

  it('returns all marts sorted (no slicing)', () => {
    const marts = Array.from({ length: 10 }, (_, i) =>
      makeMart({ id: `m${i}`, title: `Revenue Report ${i}` })
    );
    const result = rank(marts, [], [], 'revenue', null);
    expect(result).toHaveLength(10);
  });

  it('returns all results when input is small', () => {
    const marts = [
      makeMart({ id: 'm1', title: 'Revenue' }),
      makeMart({ id: 'm2', title: 'Orders' }),
    ];
    const result = rank(marts, [], [], 'revenue', null);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty marts input', () => {
    expect(rank([], [], [], 'revenue', null)).toEqual([]);
  });
});

describe('rank — vector scoring integration', () => {
  it('mart with matching vector scores higher than mart without vector', () => {
    const m1 = makeMart({ id: 'm1', title: 'Alpha' });
    const m2 = makeMart({ id: 'm2', title: 'Alpha' });

    const dim = 4;
    const promptVec = unitVec(dim);
    const martVec = unitVec(dim);
    const index: IndexedVector[] = [{ dataMartId: 'm1', vector: martVec }];

    const result = rank([m1, m2], [], index, 'alpha', promptVec);
    const r1 = result.find(r => r.dataMartId === 'm1')!;
    const r2 = result.find(r => r.dataMartId === 'm2')!;

    expect(r1.vecScore).not.toBeNull();
    expect(r2.vecScore).toBeNull();
    expect(r1.finalScore).toBeGreaterThanOrEqual(r2.finalScore);
  });

  it('vecScore is scaled to 0-100 range (sim=1.0 → vecScore=100)', () => {
    const mart = makeMart({ id: 'm1', title: 'Alpha' });
    const v = new Float32Array([1.0, 0.0]);
    const index: IndexedVector[] = [{ dataMartId: 'm1', vector: v }];

    const result = rank([mart], [], index, 'alpha', v);
    expect(result[0]!.vecScore).toBe(100);
  });
});
