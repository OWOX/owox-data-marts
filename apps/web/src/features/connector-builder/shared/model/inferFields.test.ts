import { describe, it, expect } from 'vitest';
import { inferFieldsFromSample } from './inferFields';

describe('inferFieldsFromSample', () => {
  it('infers a field type per top-level key', () => {
    expect(
      inferFieldsFromSample({
        id: 5,
        price: 1.5,
        ok: true,
        name: 'x',
        tags: ['a'],
        none: null,
      })
    ).toEqual({
      id: { type: 'integer' },
      price: { type: 'number' },
      ok: { type: 'boolean' },
      name: { type: 'string' },
      tags: { type: 'string' },
      none: { type: 'string' },
    });
  });

  // A nested object was proposed as one JSON column, so its values had to be added by hand
  // or flattened by a transformation first.
  it('proposes a field for each value inside a nested object, read through its dot-path', () => {
    expect(
      inferFieldsFromSample({ id: 1, stats: { clicks: 5, cost: 1.5, video: { views: 7 } } })
    ).toEqual({
      id: { type: 'integer' },
      stats_clicks: { type: 'integer', dataPath: 'stats.clicks' },
      stats_cost: { type: 'number', dataPath: 'stats.cost' },
      stats_video_views: { type: 'integer', dataPath: 'stats.video.views' },
    });
  });

  it('keeps an array, an empty object and an object nested too deep as one column each', () => {
    expect(
      inferFieldsFromSample({ tags: ['a'], meta: {}, a: { b: { c: { d: { e: 1 } } } } })
    ).toEqual({
      tags: { type: 'string' },
      meta: { type: 'string' },
      a_b_c_d: { type: 'string', dataPath: 'a.b.c.d' },
    });
  });

  // A data path is split on dots, so nothing below a key that holds one can be addressed.
  it('keeps an object whose keys hold a dot as one column', () => {
    expect(inferFieldsFromSample({ labels: { 'app.version': '1.2' } })).toEqual({
      labels: { type: 'string' },
    });
  });

  // A field's name becomes a column name, so the parser takes letters, digits and underscores
  // only; the key itself is still read through dataPath.
  it('names a field after its key as an identifier and reads the key through dataPath', () => {
    expect(
      inferFieldsFromSample({
        'created-at': '2026-01-01',
        '1st place': 'x',
        id: 1,
        'a-b': 2,
        a_b: 3,
      })
    ).toEqual({
      created_at: { type: 'string', dataPath: 'created-at' },
      _1st_place: { type: 'string', dataPath: '1st place' },
      id: { type: 'integer' },
      a_b: { type: 'integer', dataPath: 'a-b' },
      a_b_2: { type: 'integer', dataPath: 'a_b' },
    });
  });

  it('returns {} for an empty, non-object, or array record', () => {
    expect(inferFieldsFromSample({})).toEqual({});
    expect(inferFieldsFromSample(null as unknown as Record<string, unknown>)).toEqual({});
    expect(inferFieldsFromSample([1, 2] as unknown as Record<string, unknown>)).toEqual({});
  });
});
