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
        meta: { z: 1 },
        none: null,
      })
    ).toEqual({
      id: { type: 'integer' },
      price: { type: 'number' },
      ok: { type: 'boolean' },
      name: { type: 'string' },
      tags: { type: 'string' },
      meta: { type: 'string' },
      none: { type: 'string' },
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
